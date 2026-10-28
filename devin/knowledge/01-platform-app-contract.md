---
name: ITP — platform overview and app contract
trigger: When building or changing an internal app for the Internal Tools Platform (any repo named itp-app-* or itp-app-template)
---
Internal Tools Platform (ITP) apps are static front-end bundles (Vite + React + TypeScript) that the platform builds from a merged commit and serves inside a sandboxed iframe (`sandbox="allow-scripts allow-forms allow-popups"`, no same-origin). The served CSP is `connect-src 'none'`.

Hard rules for every ITP app:
- All data access goes through the SDK in `src/platform/sdk.ts` (`platform.getContext`, `platform.datasets.list/query/update/insert`). Never call `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or import network/HTTP libraries — they are blocked at runtime and fail lint.
- Never use `localStorage`, `sessionStorage`, or cookies (the opaque-origin sandbox throws).
- Only use the datasets and permissions listed in the build request. `read` grants allow `query`; `write` grants also allow `update`/`insert`. There is no delete.
- No secrets, API keys, or environment-specific URLs in the code.
- No server code. Everything must work as a static `dist/` built with `npm run build` (Vite `base: './'`).
- The platform shows the user identity and app version in its own header; apps should not add login screens.
- Handle SDK errors (`PlatformError` with `code` `forbidden` | `not_found` | `invalid`) by showing a clear inline message, not a crash.
