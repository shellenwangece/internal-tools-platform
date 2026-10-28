import { z } from 'zod';
import { appendAudit } from '../audit.js';
import type { Role, Team, User } from '../auth.js';
import type { DataConnector } from '../data/connector.js';
import type { Db } from '../db.js';
import { slugify, uniqueSlug } from './slug.js';

export const TEAMS = ['Compliance', 'Support', 'Risk', 'Engineering'] as const;
export type Permission = 'read' | 'write';
export interface Grant { dataset: string; permission: Permission }
export type RequestStatus = 'pending_review' | 'rejected' | 'building' | 'build_failed' | 'ready_for_review' | 'live' | 'unpublished';

export interface AppRequest {
  id: number;
  appId: number | null;
  requesterId: string;
  requesterName: string;
  name: string;
  slug: string;
  description: string;
  teams: Team[];
  grants: Grant[];
  status: RequestStatus;
  gate1By: string | null;
  gate1At: string | null;
  gate1Comment: string | null;
  gate2By: string | null;
  gate2At: string | null;
  devinSessionId: string | null;
  devinUrl: string | null;
  devinStatus: string | null;
  devinStatusDetail: string | null;
  prUrl: string | null;
  repoUrl: string | null;
  previewSha: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const grantSchema = z.object({ dataset: z.string().min(1), permission: z.enum(['read', 'write']) });
export const submitSchema = z.object({
  name: z.string().trim().min(3, 'Give the app a name of at least 3 characters').max(60),
  description: z.string().trim().min(20, 'Describe what the app should do in at least 20 characters').max(4000),
  teams: z.array(z.enum(TEAMS)).min(1, 'Choose at least one team that will use the app'),
  grants: z.array(grantSchema).min(1, 'Choose at least one dataset the app needs'),
});
export type SubmitInput = z.infer<typeof submitSchema>;

function rowToRequest(row: Record<string, unknown>): AppRequest {
  return {
    id: row.id as number,
    appId: (row.app_id as number | null) ?? null,
    requesterId: row.requester_id as string,
    requesterName: (row.requester_name as string) ?? '',
    name: row.name as string,
    slug: row.slug as string,
    description: row.description as string,
    teams: JSON.parse(row.teams_json as string),
    grants: JSON.parse(row.grants_json as string),
    status: row.status as RequestStatus,
    gate1By: (row.gate1_by as string | null) ?? null,
    gate1At: (row.gate1_at as string | null) ?? null,
    gate1Comment: (row.gate1_comment as string | null) ?? null,
    gate2By: (row.gate2_by as string | null) ?? null,
    gate2At: (row.gate2_at as string | null) ?? null,
    devinSessionId: (row.devin_session_id as string | null) ?? null,
    devinUrl: (row.devin_url as string | null) ?? null,
    devinStatus: (row.devin_status as string | null) ?? null,
    devinStatusDetail: (row.devin_status_detail as string | null) ?? null,
    prUrl: (row.pr_url as string | null) ?? null,
    repoUrl: (row.repo_url as string | null) ?? null,
    previewSha: (row.preview_sha as string | null) ?? null,
    failureReason: (row.failure_reason as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const SELECT = 'SELECT r.*, u.name AS requester_name FROM requests r JOIN users u ON u.id = r.requester_id';

export function getRequest(db: Db, id: number): AppRequest {
  const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!row) throw new RequestError(404, 'Request not found');
  return rowToRequest(row);
}

export function getRequestBySlug(db: Db, slug: string): AppRequest | null {
  const row = db.prepare(`${SELECT} WHERE r.slug = ?`).get(slug) as Record<string, unknown> | undefined;
  return row ? rowToRequest(row) : null;
}

export function listRequests(db: Db, user: User): AppRequest[] {
  const rows = user.role === 'requester' || user.role === 'app_user'
    ? db.prepare(`${SELECT} WHERE r.requester_id = ? ORDER BY r.id DESC`).all(user.id)
    : db.prepare(`${SELECT} ORDER BY r.id DESC`).all();
  return (rows as Record<string, unknown>[]).map(rowToRequest);
}

export function normalizeGrants(grants: Grant[], connector: DataConnector): Grant[] {
  const known = new Set(connector.listDatasets().map((d) => d.name));
  const byName = new Map<string, Permission>();
  for (const g of grants) {
    if (!known.has(g.dataset)) throw new RequestError(400, `Unknown dataset "${g.dataset}"`);
    const prev = byName.get(g.dataset);
    byName.set(g.dataset, prev === 'write' || g.permission === 'write' ? 'write' : 'read');
  }
  return [...byName].map(([dataset, permission]) => ({ dataset, permission }));
}

export function submitRequest(db: Db, connector: DataConnector, user: User, input: unknown): AppRequest {
  const canSubmit: Role[] = ['requester', 'approver', 'admin'];
  if (!canSubmit.includes(user.role)) throw new RequestError(403, 'Only requesters, approvers and admins can request apps');
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) throw new RequestError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
  const data = parsed.data;
  const grants = normalizeGrants(data.grants, connector);
  const slug = uniqueSlug(db, slugify(data.name));
  const teams = [...new Set(data.teams)];
  const result = db.prepare(`
    INSERT INTO requests (requester_id, name, slug, description, teams_json, grants_json, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending_review')
  `).run(user.id, data.name, slug, data.description, JSON.stringify(teams), JSON.stringify(grants));
  const id = Number(result.lastInsertRowid);
  appendAudit(db, { actorId: user.id, action: 'request.submitted', target: `request:${id}`, details: { name: data.name, slug, teams, grants } });
  return getRequest(db, id);
}

export function updateRequest(db: Db, id: number, patch: Record<string, string | number | null>): AppRequest {
  const cols = Object.keys(patch);
  if (!cols.length) return getRequest(db, id);
  const allowed = new Set(['app_id', 'status', 'grants_json', 'gate1_by', 'gate1_at', 'gate1_comment', 'gate2_by', 'gate2_at', 'devin_session_id', 'devin_url', 'devin_status', 'devin_status_detail', 'pr_url', 'repo_url', 'preview_sha', 'failure_reason']);
  for (const c of cols) if (!allowed.has(c)) throw new Error(`cannot update ${c}`);
  db.prepare(`UPDATE requests SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...patch, id });
  return getRequest(db, id);
}
