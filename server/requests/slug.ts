import type { Db } from '../db.js';

export const SLUG_RE = /^[a-z0-9-]{3,40}$/;

export function slugify(name: string): string {
  let slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  if (slug.length < 3) slug = `app-${slug}`.replace(/-+$/g, '');
  return slug;
}

export function uniqueSlug(db: Db, base: string): string {
  const taken = new Set<string>();
  for (const table of ['apps', 'requests']) {
    for (const row of db.prepare(`SELECT slug FROM ${table} WHERE slug = ? OR slug LIKE ?`).all(base, `${base}-%`) as { slug: string }[]) taken.add(row.slug);
  }
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 40 - String(n).length - 1)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
