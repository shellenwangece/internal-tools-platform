import grants from '../../mock/grants.json';
import customers from '../../mock/customers.json';
import featureFlags from '../../mock/feature_flags.json';
import kycCases from '../../mock/kyc_cases.json';
import refunds from '../../mock/refunds.json';
import schemas from '../../mock/schemas.json';
import { PlatformError, type DatasetInfo, type QueryOpts, type Row, type Transport } from './types';

const DATA: Record<string, Row[]> = { customers, feature_flags: featureFlags, kyc_cases: kycCases, refunds } as Record<string, Row[]>;
const GRANTS = grants as { dataset: string; permission: 'read' | 'write' }[];
const SCHEMAS = schemas as Omit<DatasetInfo, 'permission'>[];

/** Local-development transport: same grant rules as the platform, data from mock/*.json. */
export function createMockTransport(): Transport {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(DATA).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const grantFor = (name: string) => {
    const g = GRANTS.find((x) => x.dataset === name);
    if (!g) throw new PlatformError('forbidden', `This app has no access to the "${name}" dataset`);
    return g;
  };
  const schemaFor = (name: string) => {
    const s = SCHEMAS.find((x) => x.name === name);
    if (!s) throw new PlatformError('not_found', `Unknown dataset "${name}"`);
    return s;
  };
  return {
    async call<T>(method: string, params: unknown = {}): Promise<T> {
      const p = params as Record<string, unknown>;
      switch (method) {
        case 'getContext':
          return { user: { id: 'dev', name: 'Local Developer', role: 'app_user', team: 'Engineering' }, app: { slug: 'local', version: 'dev', mode: 'mock' } } as T;
        case 'datasets.list':
          return SCHEMAS.filter((s) => GRANTS.some((g) => g.dataset === s.name)).map((s) => ({ ...s, permission: grantFor(s.name).permission })) as T;
        case 'datasets.query': {
          const name = String(p.name); grantFor(name); const schema = schemaFor(name);
          const o = (p.opts as QueryOpts | undefined) ?? {};
          let rows = tables[name] ?? [];
          for (const [k, v] of Object.entries(o.filter ?? {})) { if (!schema.columns.some((c) => c.name === k)) throw new PlatformError('invalid', `Unknown column "${k}"`); rows = rows.filter((r) => r[k] === v); }
          if (o.search) { const s = o.search.toLowerCase(); rows = rows.filter((r) => schema.columns.some((c) => c.type === 'string' && String(r[c.name] ?? '').toLowerCase().includes(s))); }
          if (o.sort) { const { field, dir } = o.sort; if (!schema.columns.some((c) => c.name === field)) throw new PlatformError('invalid', `Unknown column "${field}"`); rows = [...rows].sort((a, b) => ((a[field] ?? '') > (b[field] ?? '') ? 1 : -1) * (dir === 'desc' ? -1 : 1)); }
          const total = rows.length; const off = o.offset ?? 0; const lim = Math.min(o.limit ?? 50, 500);
          return { rows: rows.slice(off, off + lim), total } as T;
        }
        case 'datasets.update': {
          const name = String(p.name); const g = grantFor(name); const schema = schemaFor(name);
          if (g.permission !== 'write') throw new PlatformError('forbidden', `This app can only view the "${name}" dataset`);
          const row = (tables[name] ?? []).find((r) => String(r[schema.primaryKey]) === String(p.id));
          if (!row) throw new PlatformError('not_found', `No row with ${schema.primaryKey} "${p.id}"`);
          const patch = (p.patch as Row) ?? {};
          if (schema.primaryKey in patch) throw new PlatformError('invalid', 'The primary key cannot be changed');
          for (const k of Object.keys(patch)) if (!schema.columns.some((c) => c.name === k)) throw new PlatformError('invalid', `Unknown column "${k}"`);
          Object.assign(row, patch, schema.columns.some((c) => c.name === 'updated_at') ? { updated_at: new Date().toISOString() } : {}, schema.columns.some((c) => c.name === 'updated_by') ? { updated_by: 'Local Developer' } : {});
          return { ...row } as T;
        }
        case 'datasets.insert': {
          const name = String(p.name); const g = grantFor(name); const schema = schemaFor(name);
          if (g.permission !== 'write') throw new PlatformError('forbidden', `This app can only view the "${name}" dataset`);
          const row = { ...((p.row as Row) ?? {}) };
          if (!row[schema.primaryKey]) throw new PlatformError('invalid', `${schema.primaryKey} is required`);
          (tables[name] ??= []).push(row);
          return { ...row } as T;
        }
        default:
          throw new PlatformError('invalid', `Unknown method ${method}`);
      }
    },
  };
}
