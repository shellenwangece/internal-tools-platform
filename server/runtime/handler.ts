import { z } from 'zod';
import { getAppBySlug } from '../apps.js';
import { appendAudit } from '../audit.js';
import type { User } from '../auth.js';
import { DataError, type DataConnector } from '../data/connector.js';
import type { Db } from '../db.js';
import { getRequest, type Grant } from '../requests/service.js';

export const SDK_METHODS = ['getContext', 'datasets.list', 'datasets.query', 'datasets.update', 'datasets.insert'] as const;
export type SdkMethod = (typeof SDK_METHODS)[number];

export const callSchema = z.object({
  mode: z.enum(['live', 'preview']),
  requestId: z.number().int().optional(),
  method: z.enum(SDK_METHODS),
  params: z.record(z.unknown()).default({}),
});
export type SdkCall = z.infer<typeof callSchema>;

export type SdkResult = { ok: true; result: unknown } | { ok: false; error: { code: 'forbidden' | 'not_found' | 'invalid'; message: string } };

interface Resolved { slug: string; version: string; grants: Grant[]; target: string }

function fail(code: 'forbidden' | 'not_found' | 'invalid', message: string): SdkResult {
  return { ok: false, error: { code, message } };
}

function resolve(db: Db, user: User, slug: string, call: SdkCall): Resolved | SdkResult {
  if (call.mode === 'live') {
    const app = getAppBySlug(db, slug);
    if (!app || app.kind !== 'built') return fail('not_found', 'App not found');
    if (app.status !== 'live') return fail('forbidden', 'This app is not live');
    if (user.role !== 'admin' && !app.teams.includes(user.team)) return fail('forbidden', 'Your team does not have access to this app');
    return { slug, version: app.liveSha ?? '', grants: app.grants, target: `app:${slug}` };
  }
  if (call.requestId === undefined) return fail('invalid', 'requestId is required in preview mode');
  let request;
  try { request = getRequest(db, call.requestId); } catch { return fail('not_found', 'Request not found'); }
  if (request.slug !== slug) return fail('not_found', 'Request does not match this app');
  if (request.status !== 'ready_for_review') return fail('forbidden', 'This build is not ready for preview');
  if (user.role !== 'approver' && user.role !== 'admin') return fail('forbidden', 'Only approvers can preview builds');
  if (request.requesterId === user.id) return fail('forbidden', 'You cannot review your own request');
  return { slug, version: request.previewSha ?? '', grants: request.grants, target: `request:${request.id}` };
}

export function handleSdkCall(db: Db, connector: DataConnector, user: User, slug: string, rawCall: unknown): SdkResult {
  const parsed = callSchema.safeParse(rawCall);
  if (!parsed.success) return fail('invalid', parsed.error.issues[0]?.message ?? 'Invalid call');
  const call = parsed.data;
  const resolved = resolve(db, user, slug, call);
  if ('ok' in resolved) {
    const reason = resolved.ok ? '' : resolved.error.message;
    appendAudit(db, { actorId: user.id, action: 'data.denied', target: `app:${slug}`, details: { mode: call.mode, method: call.method, reason } });
    return resolved;
  }
  const deny = (message: string, dataset?: string): SdkResult => {
    appendAudit(db, { actorId: user.id, action: 'data.denied', target: resolved.target, details: { mode: call.mode, method: call.method, dataset, reason: message } });
    return fail('forbidden', message);
  };
  const p = call.params as Record<string, unknown>;
  try {
    switch (call.method) {
      case 'getContext':
        return { ok: true, result: { user: { id: user.id, name: user.name, role: user.role, team: user.team }, app: { slug, version: resolved.version, mode: call.mode } } };
      case 'datasets.list': {
        const granted = new Map(resolved.grants.map((g) => [g.dataset, g.permission]));
        return { ok: true, result: connector.listDatasets().filter((d) => granted.has(d.name)).map((d) => ({ ...d, permission: granted.get(d.name) })) };
      }
      case 'datasets.query': {
        const name = String(p.name ?? '');
        const grant = resolved.grants.find((g) => g.dataset === name);
        if (!grant) return deny(`This app has no access to the "${name}" dataset`, name);
        const result = connector.query(name, (p.opts as Record<string, never>) ?? {});
        appendAudit(db, { actorId: user.id, action: 'data.read', target: resolved.target, details: { dataset: name, mode: call.mode, opts: p.opts ?? {}, returned: result.rows.length } });
        return { ok: true, result };
      }
      case 'datasets.update':
      case 'datasets.insert': {
        const name = String(p.name ?? '');
        const grant = resolved.grants.find((g) => g.dataset === name);
        if (!grant) return deny(`This app has no access to the "${name}" dataset`, name);
        if (grant.permission !== 'write') return deny(`This app can only view the "${name}" dataset`, name);
        if (call.method === 'datasets.update') {
          const { before, after } = connector.update(name, String(p.id ?? ''), (p.patch as Record<string, never>) ?? {}, user.name);
          appendAudit(db, { actorId: user.id, action: 'data.write', target: resolved.target, details: { dataset: name, mode: call.mode, op: 'update', id: p.id, before, after } });
          return { ok: true, result: after };
        }
        const row = connector.insert(name, (p.row as Record<string, never>) ?? {}, user.name);
        appendAudit(db, { actorId: user.id, action: 'data.write', target: resolved.target, details: { dataset: name, mode: call.mode, op: 'insert', row } });
        return { ok: true, result: row };
      }
    }
  } catch (e) {
    if (e instanceof DataError) return fail(e.code, e.message);
    throw e;
  }
}
