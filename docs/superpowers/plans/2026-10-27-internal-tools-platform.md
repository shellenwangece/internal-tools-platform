# Internal Tools Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A demo internal tools platform where non-engineers request apps, an approved request starts a real Devin Cloud session that builds the app into its own GitHub repo, and the reviewed, published app runs sandboxed inside the platform with every action audited.

**Architecture:** One Node/TypeScript process serves a React SPA, a JSON API, and the built app bundles; SQLite holds all state. Built apps are static bundles rendered in an opaque-origin sandboxed iframe that can only talk to the platform through a `postMessage` SDK. The server authorizes and audits each call. Devin is driven through the v3 API using an org playbook plus knowledge notes created by a setup script.

**Tech Stack:** Node 20, TypeScript, Express 4, better-sqlite3, cookie-session, zod, React 18 + Vite 5 + Tailwind 3 + react-router 6, Vitest + supertest, Playwright (e2e), Docker (app builds).

**Spec:** `docs/superpowers/specs/2026-10-27-internal-tools-platform-design.md`

## Global Constraints

- Single command dev/start: `npm run dev` (server + Vite with proxy), `npm start` (serves built SPA). Port `3000`.
- Secrets only from `.env` (gitignored; `.env.example` committed): `DEVIN_API_KEY`, `DEVIN_ORG_ID`, `GITHUB_TOKEN`, `GITHUB_OWNER` (default `shellenwangece`), `TEMPLATE_REPO` (default `shellenwangece/itp-app-template`), `DEVIN_MAX_ACU` (default `15`), `SESSION_SECRET`, `DEVIN_MOCK` (`1` = fake Devin), `GITHUB_MOCK` (`1` = fake GitHub, e2e only), `BUILD_MODE` (`docker` | `local`, default `docker`). Never sent to the browser, never logged, never in audit entries.
- App repos: private, `<GITHUB_OWNER>/itp-app-<slug>`. Slug = lowercase kebab of app name, `^[a-z0-9-]{3,40}$`, unique.
- Request statuses, exactly: `pending_review`, `rejected`, `building`, `build_failed`, `ready_for_review`, `live`, `unpublished`.
- Roles exactly: `requester`, `approver`, `admin`, `app_user`. Teams exactly: `Compliance`, `Support`, `Risk`, `Engineering`.
- Seed users: Priya Shah (requester, Compliance), Marco Rossi (approver, Engineering), Ava Chen (admin, Engineering), Sam Okafor (app_user, Support), Lena Park (app_user, Risk).
- Requester of a request can never pass gate 1 or gate 2 for it. Same approver may pass both.
- Dataset permission values exactly: `read`, `write` (write implies read). UI copy: "View" / "View and change".
- UI copy is plain language for non-engineers; no "PR", "SHA", "session" on requester-facing screens (Approver screens may show them).
- Apps never get network access: served with `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'self'`.
- Audit log is append-only; no UPDATE/DELETE statements against `audit_log` anywhere in the codebase.
- The app template must NOT include the Superpowers plugin or any `.devin/config.json` requiring it.

## Review Focus

1. A sandboxed app sends a message for a dataset it wasn't granted, or a `write` on a `read` grant → rejected with a clear error and an audit entry `data.denied` (tests in Task 5).
2. A forged `postMessage` from a different window or iframe → ignored by the shell (test in Task 8).
3. Devin session ends `finished` but with no PR, or gets `suspended` for out-of-credits → `build_failed` with a human-readable reason, and an Approver can retry (tests in Task 6).
4. Publish clicked before the PR is merged, or main moved after preview → publish blocked / publishes the current main SHA, never the unmerged head (tests in Task 7).
5. Two requests with names that slug to the same value → second gets `-2` suffix, never overwrites a repo (test in Task 4).

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, tailwind.config.js, .env.example, .gitignore
server/
  index.ts            # boot: config, db, seed, routes, poller, static
  config.ts           # loadConfig(): Config (zod over process.env)
  db.ts               # openDb(path): Db, migrations
  seed.ts             # seedDemo(db, opts)
  auth.ts             # session middleware, requireUser, requireRole
  audit.ts            # appendAudit, verifyAuditChain, listAudit
  data/connector.ts   # DataConnector interface
  data/csvConnector.ts
  requests/service.ts # request lifecycle + gate rules
  requests/slug.ts
  devin/client.ts     # DevinClient interface, HttpDevinClient, FakeDevinClient
  devin/prompt.ts     # buildSessionPrompt(request, datasets)
  devin/poller.ts
  github/client.ts    # GitHubClient: getPr, getBranchHeadSha
  builds/builder.ts   # buildApp(): docker | local
  builds/store.ts     # where dist bundles live, serving
  runtime/handler.ts  # SDK method dispatch + authorization
  routes/*.ts         # auth, catalog, requests, approvals, runtime, audit, admin
web/
  main.tsx, App.tsx, api.ts, pages/*, components/*, AppFrame.tsx (iframe + bridge)
data/*.csv            # mock datasets
template/             # source of itp-app-template repo
devin/knowledge/*.md, devin/playbooks/new-internal-app.md   # authored by lead, do not rewrite
scripts/devin-setup.ts, scripts/publish-template.ts
tests/**/*.test.ts, e2e/*.spec.ts
```

---

### Task 1: Scaffold, config, DB, seed, demo login

**Files:** root configs, `server/{index,config,db,seed,auth}.ts`, `routes/auth.ts`, `web/` shell with Login page, `tests/auth.test.ts`

**Interfaces — Produces:**
- `loadConfig(env = process.env): Config`
- `openDb(file: string): Db` (better-sqlite3 `Database`); tables: `users(id, name, role, team)`, `apps(id, slug, name, description, kind 'external'|'built', url, owner, teams_json, repo, live_sha, status, created_at)`, `requests(id, app_id, requester_id, name, slug, description, teams_json, grants_json, status, gate1_by, gate1_at, gate1_comment, gate2_by, gate2_at, devin_session_id, devin_url, devin_status, devin_status_detail, pr_url, repo_url, preview_sha, failure_reason, created_at, updated_at)`, `audit_log(id, ts, actor_id, action, target, details_json, prev_hash, hash)`, dataset tables (Task 3).
- `seedDemo(db)` idempotent: 5 users + 3 external apps ("KYC Review Queue", "Refunds Dashboard", "Feature Flag Admin", each `owner: 'Power Apps (legacy)'`, url `https://apps.powerapps.com/...` placeholder).
- `GET /api/auth/users` (public list for login picker), `POST /api/auth/login {userId}`, `POST /api/auth/logout`, `GET /api/me`.
- `requireUser`, `requireRole(...roles)` Express middleware; `req.user: User`.

- [ ] Write failing `tests/auth.test.ts`: login as `priya` sets cookie and `/api/me` returns `{name:'Priya Shah', role:'requester', team:'Compliance'}`; `/api/me` without cookie → 401; `requireRole('admin')` route as priya → 403.
- [ ] Run `npx vitest run tests/auth.test.ts` → FAIL.
- [ ] Implement; `createApp({db, config, devin, github, builder})` factory in `server/index.ts` so tests inject fakes.
- [ ] Run → PASS. `npm run dev` serves login page at :3000 listing 5 users.
- [ ] Commit `feat: scaffold platform with demo login`.

### Task 2: Hash-chained audit log

**Files:** `server/audit.ts`, `routes/audit.ts`, `web/pages/AuditLog.tsx`, `tests/audit.test.ts`

**Interfaces — Produces:**
- `appendAudit(db, {actorId: string|null, action: string, target: string, details?: object}): AuditEntry` — `hash = sha256hex(prev_hash + canonicalJson({ts, actorId, action, target, details}))`, genesis `prev_hash = '0'.repeat(64)`; canonicalJson = sorted keys.
- `verifyAuditChain(db): {ok: true} | {ok: false, brokenAtId: number}`
- `GET /api/audit?action=&actor=&target=&limit=&offset=` (admin), `GET /api/audit/verify` (admin), `GET /api/audit/export.csv` (admin).
- Action names used across tasks: `auth.login`, `auth.logout`, `request.submitted`, `request.grants_edited`, `request.approved`, `request.rejected`, `devin.session_started`, `devin.status_changed`, `build.preview_built`, `build.failed`, `app.published`, `app.unpublished`, `app.external_registered`, `user.role_changed`, `data.read`, `data.write`, `data.denied`, `admin.data_reset`.

- [ ] Failing tests: 3 appends then verify → ok; tamper row 2 via raw SQL in test → `{ok:false, brokenAtId:2}`; export CSV header `id,ts,actor,action,target,details,hash`.
- [ ] Implement; wire `auth.login/logout`. Admin page with filters, "Verify integrity" button showing green/red result, "Export CSV".
- [ ] PASS; commit `feat: tamper-evident audit log`.

### Task 3: CSV data connector + mock datasets

**Files:** `data/{kyc_cases,refunds,customers,feature_flags}.csv`, `server/data/{connector,csvConnector}.ts`, `routes/admin.ts` (datasets list, reset), `web/pages/Datasets.tsx`, `tests/connector.test.ts`

**Interfaces — Produces:**
```ts
interface DatasetInfo { name: string; label: string; description: string; primaryKey: string; columns: {name: string; type: 'string'|'number'|'boolean'|'datetime'}[] }
interface QueryOpts { filter?: Record<string, string|number|boolean>; search?: string; sort?: {field: string; dir: 'asc'|'desc'}; limit?: number /*default 50, max 500*/; offset?: number }
interface DataConnector {
  listDatasets(): DatasetInfo[];
  sample(name: string, n: number): Row[];
  query(name: string, opts: QueryOpts): {rows: Row[]; total: number};
  update(name: string, id: string, patch: Row, actorId: string): {before: Row; after: Row};
  insert(name: string, row: Row, actorId: string): Row;
}
```
- Columns per spec 6.3 exactly. Row counts: kyc_cases 120, refunds 150, customers 80, feature_flags 25; deterministic generator script `scripts/gen-data.ts` (seeded PRNG) committed with its output. Fake names only.
- Load CSV → SQLite table `ds_<name>` on first boot; `resetDemoData()` reloads (admin action, audited `admin.data_reset`). Column names validated against schema for filter/sort/patch (reject unknown → error, prevents SQL injection); primary key not patchable; `update` sets `updated_at`/`updated_by` when those columns exist.

- [ ] Failing tests: filter `{status:'pending'}` returns only pending; unknown column in filter throws `UnknownColumnError`; search matches across string columns; update returns before/after; patching primary key throws.
- [ ] Implement; PASS; commit `feat: CSV data connector and mock datasets`.

### Task 4: Catalog, external apps, app requests (submit)

**Files:** `server/requests/{service,slug}.ts`, `routes/{catalog,requests}.ts`, `web/pages/{Catalog,NewRequest,MyRequests,RequestDetail}.tsx`, `tests/requests.test.ts`

**Interfaces — Produces:**
- `slugify(name): string`, `uniqueSlug(db, base): string` (`-2`, `-3`…; also checks `apps.slug`).
- `submitRequest(db, user, {name, description, teams: Team[], grants: {dataset: string, permission: 'read'|'write'}[]}): Request` → `pending_review`, audit `request.submitted`. zod: name 3–60, description 20–4000, ≥1 team, ≥1 grant, datasets must exist.
- `GET /api/catalog` → apps visible to user's team (`live` built apps + external), admins see all. `POST /api/admin/apps/external` (admin) audit `app.external_registered`.
- `GET /api/datasets` (any user: info + 5 sample rows) for the request form.
- `GET /api/requests?mine=1`, `GET /api/requests/:id` (requester sees own; approver/admin see all).

- [ ] Failing tests: valid submit → pending_review + audit row; two requests "Refunds Dashboard" → slugs `refunds-dashboard`, `refunds-dashboard-2`; unknown dataset → 400; app_user cannot submit (403).
- [ ] Implement. Request form: big textarea "What should this app help you do?", team checkboxes, dataset cards with columns + sample table and View / View and change toggle. Catalog cards with "External · Power Apps (legacy)" or "Built by Devin · v<sha7>" badges.
- [ ] PASS; commit `feat: app catalog and app requests`.

### Task 5: Runtime data API (the authorization core)

**Files:** `server/runtime/handler.ts`, `routes/runtime.ts`, `tests/runtime.test.ts`

**Interfaces — Produces:**
- `POST /api/runtime/:slug/call` body `{mode: 'live'|'preview', requestId?: number, method: SdkMethod, params: object}`; response `{ok: true, result} | {ok: false, error: {code: 'forbidden'|'not_found'|'invalid', message: string}}` (HTTP 200 for app-level denials so the SDK surfaces them; 401 if not logged in).
- `SdkMethod = 'getContext' | 'datasets.list' | 'datasets.query' | 'datasets.update' | 'datasets.insert'`; params per spec 6.2 SDK surface (`query: {name, ...QueryOpts}`, `update: {name, id, patch}`, `insert: {name, row}`).
- Authorization order: user logged in → app exists → mode `live`: app `status='live'` and user team ∈ app teams (admins allowed) | mode `preview`: request `ready_for_review` and user role ∈ {approver, admin} and not the requester → dataset ∈ grants → write methods need `write`. Every allowed call audits `data.read` (details: dataset, filter, rowCount) or `data.write` (details: dataset, id, before, after); every denial audits `data.denied` (details: reason).

- [ ] Failing tests: (a) granted read returns rows + `data.read`; (b) ungranted dataset → forbidden + `data.denied`; (c) update on read grant → forbidden; (d) user from non-allowed team → forbidden; (e) preview by requester → forbidden; (f) `getContext` returns `{user:{id,name,role,team}, app:{slug, version}}`.
- [ ] Implement; PASS; commit `feat: governed runtime data API`.

### Task 6: Gate 1 + Devin build orchestration

**Files:** `server/devin/{client,prompt,poller}.ts`, `routes/approvals.ts`, `web/pages/Approvals.tsx` (+ approver view of RequestDetail), `tests/devin.test.ts`, `tests/gate1.test.ts`

**Interfaces — Consumes:** `devin/playbooks/new-internal-app.md` ID from `.devin-resources.json` (Task 10). **Produces:**
```ts
interface DevinSession { sessionId: string; url: string; status: 'new'|'claimed'|'running'|'exit'|'error'|'suspended'|'resuming'; statusDetail: string|null; pullRequests: {prUrl: string; prState: string|null}[]; structuredOutput: {repo_url?: string; pr_url?: string; summary?: string} | null }
interface DevinClient { createSession(input: {prompt: string; title: string; tags: string[]; playbookId?: string; maxAcuLimit: number}): Promise<{sessionId: string; url: string}>; getSession(id: string): Promise<DevinSession> }
```
- `HttpDevinClient`: `POST https://api.devin.ai/v3/organizations/{org}/sessions` body `{prompt, title, tags, playbook_id, max_acu_limit}`; `GET .../sessions/{id}`; maps snake_case → interface. `Authorization: Bearer ${DEVIN_API_KEY}`. Errors → thrown `DevinApiError(status, title)` without echoing headers.
- `FakeDevinClient` (used when `DEVIN_MOCK=1` and in tests): scripted transitions; in mock mode, after ~20s reports `running/finished` with a PR for a fixture repo.
- `buildSessionPrompt(req, datasets: DatasetInfo[]): string` — invokes `!new_internal_app`, then a fenced YAML block: `app_name, slug, target_repo (<owner>/itp-app-<slug>), template_repo, audience_teams, grants [{dataset, permission}], requirement (verbatim description)`, plus dataset schemas (columns + 3 sample rows each). Nothing else; rules live in the playbook/knowledge.
- `approveRequest(db, user, id, {grants?, comment?})` (approver/admin, not requester, status `pending_review`) → audit `request.approved` (+ `request.grants_edited` if changed, grants may only be narrowed) → createSession → status `building`, audit `devin.session_started`. Create failure → `build_failed` with reason. `rejectRequest(...)` → `rejected`, comment required.
- `retryBuild(db, user, id)` from `build_failed` → new session.
- Poller `startPoller(db, devin, intervalMs = 15000)`: for `building` requests, getSession; on change audit `devin.status_changed`; transitions: `statusDetail==='finished'` or `status==='exit'` → if PR url found (structuredOutput.pr_url ?? pullRequests[0].prUrl) → `ready_for_review` (store pr_url, repo_url), else `build_failed` "Devin finished without opening a pull request"; `status==='error'` → `build_failed` "Devin hit an error"; `status==='suspended'` → `build_failed` with plain text per statusDetail (e.g. `out_of_credits` → "Devin ran out of credits"); `waiting_for_user` → stays `building`, flag `needs_attention` shown to approvers with the session link.

- [ ] Failing tests: requester approving own → 403; approve → `building` + fake createSession called with prompt containing `target_repo: shellenwangece/itp-app-<slug>` and verbatim requirement; widening grants → 400; poller transitions for finished+PR, finished-no-PR, suspended/out_of_credits, error; HttpDevinClient against a local stub server: correct URL, auth header, body fields.
- [ ] Implement UI: Approvals queue; request detail shows Devin status in plain words for requesters ("Devin is building your app"), and session link + PR link for approvers.
- [ ] PASS; commit `feat: gate 1 and Devin build orchestration`.

### Task 7: Builder, preview, gate 2 publish, unpublish

**Files:** `server/github/client.ts`, `server/builds/{builder,store}.ts`, routes in `approvals.ts`/`catalog.ts`, `tests/builder.test.ts`, `tests/gate2.test.ts`

**Interfaces — Produces:**
- `GitHubClient { getPr(prUrl): Promise<{merged: boolean; headSha: string; state: string}>; getBranchHeadSha(repo: string, branch: string): Promise<string> }` (REST, `GITHUB_TOKEN`); fake for tests.
- `Builder { build(repo: string, sha: string): Promise<{distDir: string}> }`; store at `var/bundles/<slug>/<sha>/`. Docker mode: clone (token via `git -c http.extraHeader="Authorization: Basic …"` — token never in URLs or logs) into temp dir, checkout sha, `docker run --rm -v dir:/app -w /app node:20 npm ci --ignore-scripts`, then `docker run --rm --network none --memory 1g --cpus 1 … npm run build`, 5-minute timeout, require `dist/index.html`, copy `dist/` to store. Local mode: same commands as child processes with `env` = `{PATH, HOME}` only. Build log saved next to the bundle; failures → audit `build.failed` and error shown to approver.
- `POST /api/requests/:id/preview` (approver/admin, not requester, `ready_for_review`) → builds PR head → `preview_sha`, audit `build.preview_built`.
- `POST /api/requests/:id/publish` (same guards) → `getPr` must be `merged` else 409 "Merge the pull request on GitHub first" → build `main` head SHA → app row `kind='built', status='live', live_sha=<sha>, teams` → request `live`, audit `app.published` (details: sha, prUrl).
- `POST /api/admin/apps/:slug/unpublish` → `unpublished`, audit.
- Static serving: `GET /apps/:slug/:sha/*` from store with CSP from Global Constraints and `X-Content-Type-Options: nosniff`; only `live_sha` of a live app or the current `preview_sha`, else 404. Vite apps must be built with relative base (template sets `base: './'`).

- [ ] Failing tests: publish with unmerged PR → 409; publish after merge builds `getBranchHeadSha` result, not PR head; CSP header present on bundle; non-live sha → 404; local-mode builder env contains no `DEVIN_API_KEY`/`GITHUB_TOKEN` (spy on spawn); a fixture repo (`tests/fixtures/sample-app` git repo created in test) builds to dist.
- [ ] Implement; PASS; commit `feat: app builds, preview and publish`.

### Task 8: App shell + postMessage bridge

**Files:** `web/AppFrame.tsx`, `web/bridge.ts`, `web/pages/{AppView,Preview}.tsx`, `tests/bridge.test.ts` (jsdom)

**Interfaces — Consumes:** Task 5 runtime route; SDK message protocol (Task 9). **Produces:**
- Protocol (shared constant file `shared/protocol.ts`, copied into template SDK): request `{type: 'itp:request', id: string, method: SdkMethod, params: object}`; response `{type: 'itp:response', id, ok, result?, error?}`; parent → child on load `{type: 'itp:ready'}`.
- `createBridge(iframe: HTMLIFrameElement, call: (method, params) => Promise<RuntimeResponse>): () => void` — handles only messages where `event.source === iframe.contentWindow` and `data.type === 'itp:request'`; replies with `iframe.contentWindow.postMessage(resp, '*')` (opaque origin requires `'*'`; payload contains only the data the server already authorized).
- `<AppFrame slug sha mode requestId?>` renders `<iframe sandbox="allow-scripts allow-forms allow-popups" src="/apps/<slug>/<sha>/index.html">` inside the platform header ("Built by Devin · v<sha7>" and "Preview — not live" banner in preview).

- [ ] Failing tests: message from another window ignored; valid request forwarded and response posted to the iframe with the same id; non-`itp:` messages ignored.
- [ ] Implement; PASS; commit `feat: sandboxed app shell and bridge`.

### Task 9: App template repo

**Files:** `template/**` (Vite + React + TS + Tailwind app), `template/src/platform/sdk.ts`, `template/src/platform/mock.ts`, `template/AGENTS.md` (lead-authored, copy from `devin/knowledge/template-and-commands.md` content), `template/README.md`, `scripts/publish-template.ts`, `template/src/platform/sdk.test.ts`

**Interfaces — Produces (the app contract Devin builds against):**
```ts
export const platform: {
  getContext(): Promise<{user: {id: string; name: string; role: string; team: string}; app: {slug: string; version: string}}>;
  datasets: {
    list(): Promise<DatasetInfo[]>;
    query(name: string, opts?: QueryOpts): Promise<{rows: Row[]; total: number}>;
    update(name: string, id: string, patch: Row): Promise<Row>;
    insert(name: string, row: Row): Promise<Row>;
  };
}
// errors reject with PlatformError {code, message}
```
- Live mode: postMessage to `window.parent`, 30s timeout per call. Mock mode (`import.meta.env.VITE_PLATFORM_MOCK === '1'`, used by `npm run dev`): serves `template/mock/*.json` generated from `data/*.csv` (first 30 rows) with the same `grants` semantics read from `mock/grants.json`.
- Scripts: `npm run dev` (mock), `npm run build` (`tsc --noEmit && vite build`, `base: './'`), `npm run check` (`tsc --noEmit && vitest run && eslint .`).
- No network libraries in deps. ESLint `no-restricted-globals` forbids `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `localStorage`, `sessionStorage` (they fail or are blocked in the opaque-origin sandbox anyway).
- Starter `src/App.tsx`: platform-styled empty state "This app is ready to be built" using the shared UI kit components `template/src/ui/{Page,Table,Button,Badge,Card,Stat}.tsx`.
- `scripts/publish-template.ts`: creates/updates GitHub repo `TEMPLATE_REPO` (private, `is_template: true`) from `template/` and pushes `main`. Uses `gh` CLI if present else `GITHUB_TOKEN`.

- [ ] Failing SDK tests: request posts `itp:request` to parent; matching response resolves; error response rejects with `PlatformError`; timeout rejects.
- [ ] Implement; `cd template && npm ci && npm run check && npm run build` → `dist/index.html`. Building `template/` with Task 7 local builder in a test succeeds and serves in Task 8 frame (manual check in dev with a fake request).
- [ ] Commit `feat: app template with platform SDK`. Run `npm run template:publish` once secrets exist (Task 11).

### Task 10: Devin knowledge + playbook setup script

**Files:** `scripts/devin-setup.ts`, `tests/devin-setup.test.ts`. Content files `devin/knowledge/*.md` and `devin/playbooks/new-internal-app.md` are **authored by the lead and must not be reworded**.

**Interfaces — Produces:** `.devin-resources.json` (gitignored) `{playbookId: string, noteIds: Record<string, string>}`; `npm run devin:setup`.
- Knowledge files have frontmatter `name`, `trigger`; body = note body. Upsert: `GET /v3/organizations/{org}/knowledge/notes` → match by `name` → `PUT .../knowledge/notes/{note_id}` else `POST .../knowledge/notes`.
- Playbook file frontmatter `title`, `macro: '!new_internal_app'`; `structured_output_schema` = `{type:'object', properties:{repo_url:{type:'string'}, pr_url:{type:'string'}, summary:{type:'string'}}, required:['repo_url','pr_url','summary']}`. Upsert by title: `GET /v3/organizations/{org}/playbooks` then update or `POST /v3/organizations/{org}/playbooks`. **Verify the list/update playbook endpoints in docs.devin.ai API reference before coding; if update doesn't exist, report back instead of deleting/recreating.**
- [ ] Failing tests against a local stub API: first run POSTs 5 notes + 1 playbook; second run PUTs (no duplicates); writes `.devin-resources.json`.
- [ ] Implement; PASS; commit `feat: Devin knowledge and playbook setup`.

### Task 11: E2E, real Devin builds, demo readiness

**Files:** `e2e/demo.spec.ts`, `playwright.config.ts`, `README.md` (setup + demo script), `docs/demo-script.md`

- [ ] Playwright e2e with `DEVIN_MOCK=1`, `BUILD_MODE=local`, fake GitHub (env `GITHUB_MOCK=1` → fake client whose PR is "merged" after approver clicks a dev-only "Simulate merge" control that renders only in mock mode), fixture repo = `template/`: Priya submits → Marco approves → (mock) ready → preview renders inside iframe → merge → publish → Sam opens app and sees data → Ava audit log verify passes. Run `npx playwright test` → PASS.
- [ ] With real secrets: `npm run template:publish`, `npm run devin:setup`, then through the UI run the real flow for **KYC Review Queue** (Compliance; `kyc_cases` write, `customers` read) and **Feature Flag Admin** (Engineering; `feature_flags` write). Do **not** build the refunds dashboard. Lead reviews each Devin PR before merging.
- [ ] README: prerequisites (Node 20, Docker), `.env` setup, `npm run devin:setup`, `npm run template:publish`, demo reset (`npm run demo:reset` = reset data + keep live apps), recording script per spec 6.6.
- [ ] Commit `docs: demo setup and script`.
