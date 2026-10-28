# Internal Tools Platform

A governed internal-tools platform where non-engineers describe an app in plain language and Devin builds it. It is a demo replacement for Microsoft Power Apps.

```
Requester describes app ─► Approver signs off (gate 1: datasets + scope)
   ─► platform creates private repo from the app template ─► Devin session builds it and opens a PR
   ─► Approver previews the PR build in the sandbox ─► engineer merges PR on GitHub
   ─► Approver publishes (gate 2: live app pinned to the merged main SHA) ─► app users open it in the catalog
```

Every step and every data call made by an app is written to a tamper-evident audit log. Each entry is SHA-256 chained to the one before it.

## How it is secured

- **Apps run in a sandbox.** Built apps are static bundles served by the platform inside `<iframe sandbox="allow-scripts allow-forms allow-popups">` (no `allow-same-origin`), with CSP `connect-src 'none'`. They cannot read platform cookies or reach the network.
- **Data goes through the platform.** Apps call the platform SDK, which talks to the parent page via `postMessage`. The platform checks the user's login and team, whether the app is live, the dataset grant (`read` / `write`) and the operation, then logs the call, allowed or denied.
- **Untrusted code builds in isolation.** Devin-written code is built in a throwaway Docker container (`BUILD_MODE=docker`) with no platform secrets.
- **Roles.** Requester, Approver, Admin and App user. A requester can never approve, preview or publish their own request. Approvers can narrow grants but never widen them. Only admins can unpublish.
- **Data sources.** Datasets are mock CSVs under `data/` behind a `DataConnector` interface (`server/data/connector.ts`), so MCP or database connectors can be added later without touching apps.

## Setup

Requires Node 20 and Docker (for `BUILD_MODE=docker`).

```bash
npm ci
cp .env.example .env    # fill in DEVIN_API_KEY, DEVIN_ORG_ID, GITHUB_TOKEN
npm run dev             # http://localhost:3000
```

| Variable | Meaning |
|---|---|
| `DEVIN_API_KEY`, `DEVIN_ORG_ID` | Devin service-user token and org. `DEVIN_MOCK=1` uses a fake Devin instead. |
| `GITHUB_TOKEN`, `GITHUB_OWNER` | Token that can create repos from the template and read PRs. `GITHUB_MOCK=1` uses a fake GitHub. |
| `TEMPLATE_REPO` | App template repo (`shellenwangece/itp-app-template`), published from `template/` with `npm run template:publish`. |
| `DEVIN_MAX_ACU` | ACU cap per build session (default 15). |
| `BUILD_MODE` | `docker` (default, isolated) or `local`. |
| `DATABASE_PATH` | SQLite file (default `var/platform.sqlite`). |
| `COOKIE_SECURE` | `1` when serving over https. |

**Fully offline demo:** `DEVIN_MOCK=1 GITHUB_MOCK=1 BUILD_MODE=local npm run dev`. In mock mode, "merging" the PR is a button-free call: `POST /api/mock/github/merge/<requestId>`.

**Reset state:** stop the server and delete `var/*.sqlite` and `var/bundles/`. Seed users, teams, catalog entries and datasets are recreated on start. `npm run data:generate` regenerates the CSVs and the template's mock data.

## Devin setup

- `npm run devin:setup` creates or updates the five Devin Knowledge notes in `devin/knowledge/` (the app contract, SDK reference, template commands, UI conventions, dataset schemas). IDs are stored in `.devin-resources.json`.
- The build procedure is a Devin **Skill**, `template/.agents/skills/new-internal-app/SKILL.md`, which ships inside every app repo. This org uses Skills rather than Playbooks.
- The template (`template/`) is Vite + React + TypeScript + Tailwind with the platform SDK, a mock transport for local development, and ESLint rules that ban network and storage APIs.

## Demo flow (for recording)

Log in by picking a demo user on the start page:

| User | Role | Team |
|---|---|---|
| Priya Shah | Requester | Compliance |
| Marco Rossi | Approver | Engineering |
| Ava Chen | Admin | Engineering |
| Sam Okafor | App user | Support |
| Lena Park | App user | Risk |

1. **Catalog (Ava):** the three Power Apps apps appear as legacy entries, next to the Devin-built KYC Review Queue.
2. **Request (Priya):** *Request an app* → "Refunds Dashboard", describe it in plain language, audience Support, dataset Refunds (View or View and change) → *Send for approval*.
3. **Gate 1 (Marco):** open the request → optionally narrow the data access → *Approve and start building*. The request links to the live Devin session and the new private repo.
4. **Build:** Devin builds the app from the template and opens a PR (typically 15–40 min; cut this in the edit).
5. **Preview (Marco):** *Build preview* runs the PR in the sandbox with real data access.
6. **Merge:** merge the PR on GitHub. *Publish to catalog* is refused until it is merged.
7. **Gate 2 (Marco):** *Publish to catalog*. The live app is pinned to the merged commit.
8. **Use (Sam):** the app is in Sam's catalog. Lena (Risk team) does not see it.
9. **Governance (Ava):** *Audit log* → filter, export CSV, *Verify integrity*. *Admin* manages datasets and external apps, and can unpublish.

## Known limitations (demo v1)

- Data access is per dataset: anyone allowed to use an app sees the whole dataset it was granted. No row-level filtering or PII masking yet.
- Previews use the same datasets as live apps, so an approver who clicks an action in a preview really changes that row (it is audited as `mode: preview`).
- Built apps, previews and data live in the local SQLite file (`DATABASE_PATH`) and `var/bundles`. A fresh clone starts without the prebuilt KYC app; build it once through the normal request flow.
- Data sources are CSV files behind `DataConnector`; MCP connectors are future work.

## Development

```bash
npm test             # unit and API tests (vitest)
npm run typecheck
npm run build
npm run e2e          # Playwright: full mocked flow in a real browser
cd template && npm ci && npm run check && npm run build
```

Design and plan: `docs/superpowers/specs/` and `docs/superpowers/plans/`. This repo requires the [Superpowers](https://github.com/obra/superpowers) plugin, which is declared in `.devin/config.json` and pinned to a commit.
