---
name: ITP — platform SDK API reference
trigger: When writing code that reads or writes data in an Internal Tools Platform app (itp-app-*)
---
Import: `import { platform, PlatformError } from './platform/sdk'` (path relative to `src/`).

- `platform.getContext(): Promise<{ user: { id, name, role, team }, app: { slug, version } }>` — current user; use `user.name` for "updated by" display. Roles: requester, approver, admin, app_user. Teams: Compliance, Support, Risk, Engineering.
- `platform.datasets.list(): Promise<DatasetInfo[]>` — only datasets this app was granted. `DatasetInfo = { name, label, description, primaryKey, columns: { name, type: 'string'|'number'|'boolean'|'datetime' }[] }`.
- `platform.datasets.query(name, { filter?, search?, sort?, limit?, offset? }): Promise<{ rows, total }>` — `filter` is exact-match on columns (`{ status: 'pending' }`), `search` is a case-insensitive substring across string columns, `sort = { field, dir: 'asc'|'desc' }`, `limit` default 50 max 500. Use `total` for pagination.
- `platform.datasets.update(name, id, patch): Promise<Row>` — `id` is the primary-key value; the primary key cannot be patched; the platform stamps `updated_at`/`updated_by` when those columns exist.
- `platform.datasets.insert(name, row): Promise<Row>`.
- Errors reject with `PlatformError { code: 'forbidden'|'not_found'|'invalid', message }`. Unknown columns in filter/sort/patch are `invalid`.
- Every call is authorized and audited by the platform; do not add your own permission logic beyond hiding edit controls when the grant is `read` (check via the build request's grants).
- Local development: `npm run dev` runs in mock mode against `mock/*.json` and `mock/grants.json`; keep `mock/grants.json` equal to the request's grants.
