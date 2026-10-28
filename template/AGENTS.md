# ITP app — rules for agents

This repo is an Internal Tools Platform (ITP) app: a static Vite + React + TypeScript + Tailwind bundle served inside a sandboxed iframe by the platform.

- Get data only through `src/platform/sdk.ts` (`platform.getContext`, `platform.datasets.list/query/update/insert`). Never use fetch/XHR/WebSocket, storage APIs, cookies, or network libraries. ESLint enforces this; the runtime sandbox (`connect-src 'none'`) blocks it anyway.
- Use only the datasets and permissions in `mock/grants.json` (mirrors the approved request). `read` → query only; `write` → also update/insert. No delete exists.
- Do not edit `src/platform/`, `eslint.config.js` restrictions, or `base: './'` in `vite.config.ts`.
- Build the UI with `src/ui` (Page, Card, Stat, Badge, Table, Pagination, Button, Input, Select, money, when). Plain language for non-engineers.
- `npm run check` (tsc + vitest + eslint) and `npm run build` must pass before a PR. Add a Vitest test per main view rendering against the mock SDK.
- See `.agents/skills/new-internal-app/SKILL.md` for the build procedure.
