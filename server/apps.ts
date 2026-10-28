import { z } from 'zod';
import { appendAudit } from './audit.js';
import type { Team, User } from './auth.js';
import type { Db } from './db.js';
import { RequestError, TEAMS, type Grant } from './requests/service.js';

export interface CatalogApp {
  id: number;
  slug: string;
  name: string;
  description: string;
  kind: 'external' | 'built';
  url: string | null;
  owner: string;
  teams: Team[];
  repo: string | null;
  liveSha: string | null;
  status: string;
  grants: Grant[];
  createdAt: string;
}

export function rowToApp(row: Record<string, unknown>): CatalogApp {
  return {
    id: row.id as number,
    slug: row.slug as string,
    name: row.name as string,
    description: row.description as string,
    kind: row.kind as 'external' | 'built',
    url: (row.url as string | null) ?? null,
    owner: row.owner as string,
    teams: JSON.parse(row.teams_json as string),
    repo: (row.repo as string | null) ?? null,
    liveSha: (row.live_sha as string | null) ?? null,
    status: row.status as string,
    grants: row.grants_json ? JSON.parse(row.grants_json as string) : [],
    createdAt: row.created_at as string,
  };
}

export function getAppBySlug(db: Db, slug: string): CatalogApp | null {
  const row = db.prepare('SELECT * FROM apps WHERE slug = ?').get(slug) as Record<string, unknown> | undefined;
  return row ? rowToApp(row) : null;
}

export function listCatalog(db: Db, user: User): CatalogApp[] {
  const rows = db.prepare('SELECT * FROM apps ORDER BY kind DESC, name').all() as Record<string, unknown>[];
  return rows.map(rowToApp).filter((app) => {
    if (user.role === 'admin') return true;
    if (app.kind === 'external') return true;
    return app.status === 'live' && app.teams.includes(user.team);
  });
}

export const externalSchema = z.object({
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().max(400).default(''),
  url: z.string().url(),
  owner: z.string().trim().min(1).max(80),
  teams: z.array(z.enum(TEAMS)).min(1),
});

export function registerExternalApp(db: Db, admin: User, input: unknown): CatalogApp {
  const parsed = externalSchema.safeParse(input);
  if (!parsed.success) throw new RequestError(400, parsed.error.issues[0]?.message ?? 'Invalid app');
  const d = parsed.data;
  const base = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let slug = `ext-${base}`.slice(0, 40);
  for (let n = 2; getAppBySlug(db, slug); n++) slug = `ext-${base}`.slice(0, 37) + `-${n}`;
  const result = db.prepare(`
    INSERT INTO apps (slug, name, description, kind, url, owner, teams_json, status)
    VALUES (?, ?, ?, 'external', ?, ?, ?, 'external')
  `).run(slug, d.name, d.description, d.url, d.owner, JSON.stringify([...new Set(d.teams)]));
  appendAudit(db, { actorId: admin.id, action: 'app.external_registered', target: `app:${slug}`, details: { name: d.name, url: d.url, teams: d.teams } });
  return rowToApp(db.prepare('SELECT * FROM apps WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>);
}
