---
name: ITP — app template layout and build/check commands
trigger: When creating or working in an itp-app-* repository or the itp-app-template repository
---
New app repos are created from the GitHub template repo `shellenwangece/itp-app-template` (`gh repo create shellenwangece/itp-app-<slug> --private --template shellenwangece/itp-app-template --clone`).

Layout:
- `src/App.tsx` — app entry; replace the starter empty state.
- `src/platform/` — SDK and mock bridge. Do not modify.
- `src/ui/` — shared UI kit (`Page`, `Card`, `Table`, `Button`, `Badge`, `Stat`). Use these; extend rather than replace.
- `mock/` — mock data + `grants.json` for local dev.
- `AGENTS.md` — the same rules as the ITP knowledge notes.

Commands (Node 20):
- `npm ci` — install.
- `npm run dev` — local dev server in mock mode.
- `npm run check` — `tsc --noEmit`, `vitest run`, `eslint .`. Must pass before opening a PR.
- `npm run build` — must produce `dist/index.html`.

Add at least one Vitest test per main view that renders it against the mock SDK. Do not add dependencies that need network access at runtime or native build steps; `npm ci --ignore-scripts` must work.
