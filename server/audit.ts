import { createHash } from 'node:crypto';
import type { Db } from './db.js';

const GENESIS_HASH = '0'.repeat(64);

export interface AuditInput {
  actorId: string | null;
  action: string;
  target: string;
  details?: Record<string, unknown>;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actorId: string | null;
  actor: string | null;
  action: string;
  target: string;
  details: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

interface StoredAuditEntry {
  id: number;
  ts: string;
  actor_id: string | null;
  action: string;
  target: string;
  details_json: string;
  prev_hash: string;
  hash: string;
}

export interface AuditFilters {
  action?: string;
  actor?: string;
  target?: string;
  limit?: number;
  offset?: number;
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function hashEntry(previousHash: string, entry: Omit<AuditInput, 'details'> & {
  ts: string;
  details: Record<string, unknown>;
}): string {
  return createHash('sha256')
    .update(previousHash + canonicalJson(entry))
    .digest('hex');
}

export function appendAudit(db: Db, input: AuditInput): AuditEntry {
  const last = db.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').get() as
    | { hash: string }
    | undefined;
  const prevHash = last?.hash ?? GENESIS_HASH;
  const ts = new Date().toISOString();
  const details = input.details ?? {};
  const hash = hashEntry(prevHash, {
    ts,
    actorId: input.actorId,
    action: input.action,
    target: input.target,
    details,
  });
  const result = db
    .prepare(`
      INSERT INTO audit_log (ts, actor_id, action, target, details_json, prev_hash, hash)
      VALUES (@ts, @actorId, @action, @target, @details, @prevHash, @hash)
    `)
    .run({
      ts,
      actorId: input.actorId,
      action: input.action,
      target: input.target,
      details: JSON.stringify(details),
      prevHash,
      hash,
    });

  return {
    id: Number(result.lastInsertRowid),
    ts,
    actorId: input.actorId,
    actor: null,
    action: input.action,
    target: input.target,
    details,
    prevHash,
    hash,
  };
}

export function verifyAuditChain(db: Db): { ok: true } | { ok: false; brokenAtId: number } {
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all() as StoredAuditEntry[];
  let previousHash = GENESIS_HASH;

  for (const row of rows) {
    let details: Record<string, unknown>;
    try {
      details = JSON.parse(row.details_json) as Record<string, unknown>;
    } catch {
      return { ok: false, brokenAtId: row.id };
    }
    const expectedHash = hashEntry(previousHash, {
      ts: row.ts,
      actorId: row.actor_id,
      action: row.action,
      target: row.target,
      details,
    });
    if (row.prev_hash !== previousHash || row.hash !== expectedHash) {
      return { ok: false, brokenAtId: row.id };
    }
    previousHash = row.hash;
  }
  return { ok: true };
}

export function listAudit(db: Db, filters: AuditFilters = {}): AuditEntry[] {
  const conditions: string[] = [];
  const parameters: Record<string, string | number> = {
    limit: Math.max(1, Math.min(filters.limit ?? 50, 500)),
    offset: Math.max(0, filters.offset ?? 0),
  };
  if (filters.action) {
    conditions.push('a.action = @action');
    parameters.action = filters.action;
  }
  if (filters.actor) {
    conditions.push('(a.actor_id = @actor OR u.name LIKE @actorLike)');
    parameters.actor = filters.actor;
    parameters.actorLike = `%${filters.actor}%`;
  }
  if (filters.target) {
    conditions.push('a.target LIKE @target');
    parameters.target = `%${filters.target}%`;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT a.id, a.ts, a.actor_id, u.name AS actor, a.action, a.target,
      a.details_json, a.prev_hash, a.hash
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_id
    ${where}
    ORDER BY a.id DESC
    LIMIT @limit OFFSET @offset
  `).all(parameters) as Array<StoredAuditEntry & { actor: string | null }>;

  return rows.map((row) => ({
    id: row.id,
    ts: row.ts,
    actorId: row.actor_id,
    actor: row.actor,
    action: row.action,
    target: row.target,
    details: JSON.parse(row.details_json) as Record<string, unknown>,
    prevHash: row.prev_hash,
    hash: row.hash,
  }));
}
