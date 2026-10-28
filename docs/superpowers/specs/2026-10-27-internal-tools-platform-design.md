# Internal Tools Platform — Design

Status: draft for approval · 2026-10-27

## 1. Intent and why

A Series C fintech (~60 engineers) pays ~$250K/yr for Microsoft Power Apps to run 3 internal apps (KYC review queue, refunds dashboard, feature-flag admin) and plans 10+ more. Their VP of Engineering wants to know whether Devin can replace that: non-engineers ask for tools, Devin builds them, and the company keeps full ownership of code and data.

This repo is a **working demo** of that replacement: a self-hosted internal tools platform where non-engineers request apps in plain language, a Devin Cloud session builds each app into its own GitHub repo, and the approved app runs inside the platform under central governance.

**Deliverables:** the demo code (this repo plus an app template repo) and a pre-recorded video that the user records. Because the video is pre-recorded, slow steps (a Devin build takes minutes to tens of minutes) can be cut in editing; the Devin builds themselves are real, not faked.

## 2. Goals, non-goals, anti-goals

**Goals**
1. App catalog: register existing org apps and list Devin-built apps in one place.
2. A non-engineer can request a new app by describing it in plain language.
3. An approved request starts a real Devin Cloud session (v3 API) that creates a GitHub repo for the app and builds it.
4. After a second approval the app is published and usable inside the platform.
5. Roles with separation of duties; two approval gates; a tamper-evident audit trail; data access enforced by the platform.
6. Data comes from mock CSV datasets behind a connector interface that MCP or real sources can plug into later.

**Non-goals (this demo)**
- MCP or real data connectors. The interface exists, and the only implementation is CSV.
- Row-level or column-level data restrictions. Grants are per app, per dataset (view, or view and change), and apply to everyone allowed to use the app. Row filters and PII masking are a later addition at the connector layer.
- Real SSO. Demo login with seeded users; the auth layer is shaped so OIDC can replace it.
- Custom server code per app (apps are front-end only; see Approaches).
- Production hosting, HA, multi-tenancy, scaling.
- Devin Cloud's own app hosting (disabled for Enterprise orgs, public URLs).

**Anti-goals (failure even if it "works")**
- Governance looks bolted on, e.g. a path where a non-engineer's app reaches data or goes live without both approvals.
- Built apps hold credentials or read data directly instead of through the platform.
- Secrets (Devin API key, GitHub token) are reachable from the browser or committed.
- The demo is flaky to record: anything that needs a perfect live run to look good.
- Jargon-heavy UI. The requester is a compliance analyst or support lead, not an engineer.

## 3. Users and roles

Each user has one **role** and one **team** (Compliance, Support, Risk, Engineering).

| Role | Can |
|---|---|
| Requester | Submit app requests, see their own requests' status, use apps their team may access |
| Approver | Everything a Requester can, plus approve/reject requests (gate 1) and approve/publish builds (gate 2). Cannot approve a request they submitted. |
| Admin | Manage users and roles, register external apps, manage datasets, view and export the full audit log, unpublish apps |
| App user | Use published apps their team may access, including changing data through an app granted "view and change" (e.g. resolving a KYC case). No platform actions beyond that. |

Seeded demo users (one per role, login by picking a user on the login screen): e.g. Priya (Requester, Compliance), Marco (Approver, Engineering), Ava (Admin, Engineering), Sam (App user, Support).

## 4. Core flows

### 4.1 Register an existing app
Admin adds an **external app**: name, description, owner, URL, teams allowed. It shows in the catalog with an "External" badge and opens in a new tab. The platform does not govern its data. Seed the 3 Power Apps apps this way, labelled "Power Apps (legacy)", so the catalog tells the migration story.

### 4.2 Request a new app (Requester)
A form in plain language:
- App name, plus "What should this app help you do?" (free text, the main input)
- Who will use it (teams)
- What data it needs: pick datasets from the catalog, each with **view** or **view and change**. Show each dataset's columns and a few sample rows so the requester knows what's there.

Submitting creates a request in status `pending_review`, which is logged.

### 4.3 Gate 1: approve the request (Approver)
The Approver sees the description, requested datasets/permissions and audience. They can edit the dataset permissions (e.g. downgrade to view-only), then approve or reject with a comment. On approval the platform starts a Devin session (4.4). Status: `building`.

### 4.4 Build (Devin Cloud)
The platform calls `POST /v3/organizations/{org_id}/sessions` with:
- `prompt`: generated from the request. It contains the requirement text, the target repo name, the template repo to start from, the approved dataset schemas (columns, types, sample rows) and permissions, the SDK contract, and the instruction to open a PR and stop. It must say not to ask the human questions: requesters aren't watching the Devin session.
- `title`, `tags` (e.g. `internal-tools-platform`, `app:<slug>`), `max_acu_limit` (configurable).
- `structured_output_schema` asking for `{repo_url, pr_url, summary}`.

Devin creates a private repo `<GITHUB_OWNER>/itp-app-<slug>` from the template repo, builds the app on a branch, runs the template's checks, and opens a PR to `main`.

The platform polls `GET /v3/organizations/{org_id}/sessions/{devin_id}` (every ~15s while any build is active) and stores `status`, `status_detail`, `pull_requests[]`, `structured_output` and `url`. Requesters see a plain-language status ("Devin is building your app"), with a link to the Devin session for engineers. When the session reaches `status_detail = finished` (or `exit`) with a PR, status moves to `ready_for_review`. `error`, `suspended` or no PR moves it to `build_failed`, and an Approver can retry, which starts a new session.

### 4.5 Gate 2: review and publish (Approver)
The Approver sees the PR link and a **Preview**. The platform clones the PR head commit, builds it, and serves it in the same sandbox as live apps, against the same datasets, with writes allowed. The code review happens on GitHub: the Approver merges the PR there. In the platform they click **Publish**. The platform then builds the latest `main` commit, records that commit SHA as the published version, and the app appears in the catalog for the approved teams. Status: `live`. Publish is blocked if the PR isn't merged. The requester cannot do gate 2 on their own request.

Admins can **unpublish**, which hides the app and stops serving it.

The same Approver may pass both gates on one request. Only the requester is excluded from both.

**Build isolation:** app code is untrusted, and so are its dependency install scripts. Preview and publish builds run in a throwaway Docker container (`node` image, repo mounted, no platform secrets in the environment, network allowed only for the package install, CPU/memory/time limits). If Docker isn't available, fall back to a subprocess in a temp directory with an empty environment apart from `PATH`/`HOME`, and log a warning. Only the build output (`dist/`) is copied back and served.

### 4.6 Use an app
The catalog shows the apps the user's team may access. Opening one renders it in the platform shell (header, app name, "Built by Devin · version abc1234"). All of its data access goes through the platform.

### 4.7 Audit trail
Every state change and data access is appended to an audit log: login, request submitted/edited/approved/rejected, Devin session started/status changed, preview built, published/unpublished, user/role changes, external app registered, and each dataset read/write by an app (actor, app, dataset, operation, row count or row ids). Admins get a filterable view and CSV export.

Entries are **hash-chained**: each entry stores `hash = sha256(prev_hash + canonical_json(entry))`, and an admin "Verify integrity" button recomputes the chain. Entries are never updated or deleted.

## 5. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **Platform-hosted front-end apps.** Devin builds each app as a static front end in its own repo from a template. The platform builds and serves it in a sandbox and mediates all data access. | One deployable, governance in one place, apps never hold data or credentials. No custom per-app server code, which is fine for queues, dashboards and admin panels. |
| B | Each app is full-stack in its own container, and the platform deploys and proxies them. | Flexible, but every app holds direct data access (weak governance story) and many moving parts while recording. |
| C | Devin Cloud deploys each app to a public URL and the platform links to it. | Least work, but disabled for Enterprise orgs, public URLs, and data outside platform control. |

The user picked A because governance is the core of the pitch.

## 6. Architecture (approach A)

### 6.1 Components
1. **Platform** (this repo): web UI plus API server plus SQLite database, run as a single process.
2. **App template repo** (`<GITHUB_OWNER>/itp-app-template`, created as part of this work): a starting point for every app, containing a front-end scaffold, the platform SDK, an `AGENTS.md` telling Devin the rules (SDK-only data access, no network calls, no secrets, build command, how to run checks), and a local dev mode that uses mock data.
3. **Built apps**: one repo per app, created by Devin from the template.

### 6.2 App sandbox and SDK (the security boundary)
- Published and preview apps are served by the platform under `/apps/<slug>/<sha>/`, rendered in an `<iframe sandbox="allow-scripts allow-forms allow-popups">` **without `allow-same-origin`**. The app gets an opaque origin, cannot read platform cookies, and cannot call the platform API directly.
- Served app files get a strict CSP: `default-src 'self'` with no external hosts, and `connect-src 'none'`. The app can't make network calls at all.
- The **SDK** (in the template) talks to the parent window via `postMessage`. The platform shell checks that each message comes from that app's iframe, then calls the platform API on the user's behalf, tagging the call with `(user, app)`.
- The server enforces, on every call: the user is logged in, the user's team may use the app, the app's approved permissions include this dataset and operation, and the app is live (or it's a preview viewed by an Approver). Each call is audited.

SDK surface, small on purpose:
```ts
platform.getContext(): Promise<{ user: {id, name, role, team}, app: {slug, version} }>
platform.datasets.list(): Promise<DatasetInfo[]>          // approved datasets only
platform.datasets.query(name, { filter?, sort?, limit?, offset? }): Promise<{ rows, total }>
platform.datasets.update(name, rowId, patch): Promise<Row> // needs "view and change"
platform.datasets.insert(name, row): Promise<Row>          // needs "view and change"
```
No delete in the demo. Every write records actor and timestamp, and the audit entry stores before and after values.

### 6.3 Data connectors
A `DataConnector` interface (`listDatasets`, `getSchema`, `query`, `update`, `insert`) with one implementation: **CSV**. On first start, CSV files in `data/` are loaded into SQLite tables, and writes go to SQLite, never back to the CSV. A "reset demo data" admin action reloads them. MCP or a real database later is a new connector, with no change to apps or the SDK.

Mock datasets, realistic and fake, about 50–200 rows each:
- `kyc_cases`: case_id, customer_name, country, risk_score, document_type, status (pending/approved/rejected/escalated), assigned_to, submitted_at, notes
- `refunds`: refund_id, customer_id, amount, currency, reason, status (requested/approved/denied/paid), requested_at, processed_by
- `customers`: customer_id, name, email, country, segment, created_at
- `feature_flags`: flag_key, description, enabled, rollout_percent, owner_team, updated_at, updated_by

### 6.4 Secrets and config
`.env` (gitignored; `.env.example` committed) holds `DEVIN_API_KEY` (service user token), `DEVIN_ORG_ID`, `GITHUB_TOKEN` (used by the platform only to clone app repos and read PR merge state), `GITHUB_OWNER`, `TEMPLATE_REPO`, `DEVIN_MAX_ACU`, and `SESSION_SECRET`. These are used only server-side, never sent to the browser, never logged.

Devin creates the app repos through the org's GitHub integration. The platform's `GITHUB_TOKEN` is only for reading.

### 6.5 Demo script the build must support
1. Log in as Ava (Admin): catalog shows 3 "Power Apps (legacy)" external apps, plus one already-live Devin-built app (built during development, e.g. the KYC review queue).
2. Log in as Priya (Requester, Compliance): request "Refunds dashboard", pick `refunds` (view) and `customers` (view), audience Support and Risk.
3. Log in as Marco (Approver): review, approve → Devin session starts (video cuts).
4. Status `ready_for_review`: Marco opens the PR on GitHub, previews, merges, publishes.
5. Log in as Sam (App user, Support): uses the refunds dashboard inside the platform.
6. Ava: audit log shows the whole chain, verify integrity passes, export CSV.
7. Show a denial: Priya can't approve her own request, and an app can't read a dataset it wasn't granted (error and audit entry).

## 7. Decisions made with the user
- Working demo plus a pre-recorded video, not production.
- Real Devin Cloud sessions via the v3 API and a service user token, supplied via a secret prompt, never pasted.
- Mock CSV data, no MCP for now; keep a connector seam for later.
- Two approval gates: before build and before go-live.
- Approach A.

## 8. Calls made by Devin (user can override)
- Roles Requester / Approver / Admin / App user, with team-based app access.
- Hash-chained audit log.
- Iframe sandbox + postMessage SDK + CSP as the security boundary.
- Code review happens on GitHub (merge PR); publish happens in the platform and is pinned to a commit SHA.
- App repos are private, named `itp-app-<slug>`, under the same GitHub owner as this repo.
- Grants are per dataset, with no row or column filtering. App users can change data through apps granted "view and change". One Approver may pass both gates.
- Builds run in a throwaway Docker container with no platform secrets.
- Seed the 3 Power Apps apps as external entries, and pre-build one app so the catalog isn't empty in the video.
- The app template does **not** include the Superpowers plugin: its brainstorming skill waits for human answers, which would stall unattended build sessions.

## 9. Left to the builder
- Language, framework, libraries and UI kit. Default expectation: TypeScript end to end, a single `npm run dev` / `npm start`, SQLite, a clean modern UI suitable for video.
- Exact database schema, API routes, polling mechanics, and the build pipeline for app previews/publishing (e.g. `npm ci && npm run build` in a temp dir with a timeout).
- Prompt wording for Devin sessions, within the constraints in 4.4.
- Test strategy (expect unit tests on authorization, gates and audit chain, plus an end-to-end test with Devin mocked).
