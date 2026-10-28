import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../server/db.js';
import { seedDemo } from '../server/seed.js';
import { SLUG_RE, slugify, uniqueSlug } from '../server/requests/slug.js';

describe('slugs', () => {
  let db: ReturnType<typeof openDb>;
  beforeEach(() => { db = openDb(':memory:'); seedDemo(db); });
  afterEach(() => db.close());

  it('slugifies plain-language names', () => {
    expect(slugify('Refunds Dashboard')).toBe('refunds-dashboard');
    expect(slugify('  KYC Review Queue!! ')).toBe('kyc-review-queue');
    expect(slugify('A'.repeat(60))).toMatch(SLUG_RE);
    expect(slugify('x')).toBe('app-x');
  });

  it('suffixes duplicates with -2, -3', () => {
    db.prepare("INSERT INTO apps (slug, name, kind) VALUES ('ops-tool', 'x', 'external')").run();
    expect(uniqueSlug(db, 'ops-tool')).toBe('ops-tool-2');
    db.prepare("INSERT INTO apps (slug, name, kind) VALUES ('ops-tool-2', 'x', 'external')").run();
    expect(uniqueSlug(db, 'ops-tool')).toBe('ops-tool-3');
    expect(uniqueSlug(db, 'brand-new')).toBe('brand-new');
  });
});
