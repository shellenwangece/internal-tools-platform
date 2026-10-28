import type { Express } from 'express';
import { appendAudit, listAudit, verifyAuditChain } from '../server/audit.js';
import { requireRole, requireUser } from '../server/auth.js';
import type { Db } from '../server/db.js';

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ''
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function registerAuditRoutes(app: Express, db: Db): void {
  const adminOnly = [requireUser(db), requireRole('admin')];

  app.get('/api/audit', ...adminOnly, (req, res) => {
    const limit = Number(req.query.limit);
    const offset = Number(req.query.offset);
    res.json(listAudit(db, {
      action: typeof req.query.action === 'string' ? req.query.action : undefined,
      actor: typeof req.query.actor === 'string' ? req.query.actor : undefined,
      target: typeof req.query.target === 'string' ? req.query.target : undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      offset: Number.isFinite(offset) && offset >= 0 ? offset : undefined,
    }));
  });

  app.get('/api/audit/verify', ...adminOnly, (_req, res) => {
    res.json(verifyAuditChain(db));
  });

  app.get('/api/audit/export.csv', ...adminOnly, (_req, res) => {
    const entries = listAudit(db, { limit: 500 });
    const header = 'id,ts,actor,action,target,details,hash';
    const rows = [
      ...entries.map((entry) => [
        entry.id,
        entry.ts,
        entry.actor ?? entry.actorId,
        entry.action,
        entry.target,
        entry.details,
        entry.hash,
      ]),
    ];
    const csv = [header, ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n');
    res.type('text/csv').attachment('audit-log.csv').send(csv);
  });
}

export function auditAdminAction(db: Db, input: Parameters<typeof appendAudit>[1]) {
  return appendAudit(db, input);
}
