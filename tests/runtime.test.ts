import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/index.js';
import { seedDemo } from '../server/seed.js';

describe('runtime data API', () => {
  let db: ReturnType<typeof openDb>;
  let app: ReturnType<typeof createApp>;
  const as = async (id: string) => { const a = request.agent(app); await a.post('/api/auth/login').send({ userId: id }); return a; };
  const call = (agent: ReturnType<typeof request.agent>, slug: string, body: object) => agent.post(`/api/runtime/${slug}/call`).send({ mode: 'live', params: {}, ...body });

  beforeEach(() => {
    db = openDb(':memory:'); seedDemo(db);
    app = createApp({ db, config: loadConfig({ SESSION_SECRET: 'test-session-secret' }) });
    db.prepare(`INSERT INTO apps (slug, name, kind, teams_json, grants_json, status, live_sha) VALUES ('kyc-review-queue', 'KYC Review Queue', 'built', '["Compliance","Risk"]', '[{"dataset":"kyc_cases","permission":"write"},{"dataset":"customers","permission":"read"}]', 'live', 'abc1234def')`).run();
    db.prepare(`INSERT INTO requests (id, requester_id, name, slug, description, teams_json, grants_json, status, preview_sha) VALUES (7, 'priya', 'Refunds', 'refunds-dashboard', 'desc', '["Support"]', '[{"dataset":"refunds","permission":"read"}]', 'ready_for_review', 'fff0000')`).run();
  });
  afterEach(() => db.close());

  it('returns context and granted datasets, reading with audit', async () => {
    const lena = await as('lena');
    const ctx = await call(lena, 'kyc-review-queue', { method: 'getContext' });
    expect(ctx.body).toEqual({ ok: true, result: { user: { id: 'lena', name: 'Lena Park', role: 'app_user', team: 'Risk' }, app: { slug: 'kyc-review-queue', version: 'abc1234def', mode: 'live' } } });
    const list = await call(lena, 'kyc-review-queue', { method: 'datasets.list' });
    expect(list.body.result.map((d: { name: string; permission: string }) => `${d.name}:${d.permission}`)).toEqual(['kyc_cases:write', 'customers:read']);
    const q = await call(lena, 'kyc-review-queue', { method: 'datasets.query', params: { name: 'kyc_cases', opts: { filter: { status: 'pending' }, limit: 5 } } });
    expect(q.body.ok).toBe(true);
    expect(q.body.result.rows).toHaveLength(5);
    const ava = await as('ava');
    const audit = await ava.get('/api/audit');
    expect(audit.body.some((e: { action: string; details: { dataset?: string } }) => e.action === 'data.read' && e.details.dataset === 'kyc_cases')).toBe(true);
  });

  it('denies ungranted datasets, writes on read grants, wrong team, and logs data.denied', async () => {
    const lena = await as('lena');
    const no = await call(lena, 'kyc-review-queue', { method: 'datasets.query', params: { name: 'refunds' } });
    expect(no.body).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    const ro = await call(lena, 'kyc-review-queue', { method: 'datasets.update', params: { name: 'customers', id: 'C-1001', patch: { segment: 'vip' } } });
    expect(ro.body.error.message).toMatch(/only view/);
    const sam = await as('sam');
    const team = await call(sam, 'kyc-review-queue', { method: 'getContext' });
    expect(team.body.error.message).toMatch(/team/);
    const ok = await call(lena, 'kyc-review-queue', { method: 'datasets.update', params: { name: 'kyc_cases', id: 'KYC-2001', patch: { status: 'approved' } } });
    expect(ok.body.result.status).toBe('approved');
    expect(ok.body.result.updated_by).toBe('Lena Park');
    const ava = await as('ava');
    const denied = (await ava.get('/api/audit')).body.filter((e: { action: string }) => e.action === 'data.denied');
    expect(denied.length).toBe(3);
  });

  it('preview mode: approver may read, requester may not, non-ready request refused', async () => {
    const marco = await as('marco');
    const ok = await call(marco, 'refunds-dashboard', { mode: 'preview', requestId: 7, method: 'datasets.query', params: { name: 'refunds', opts: { limit: 2 } } });
    expect(ok.body.ok).toBe(true);
    expect(ok.body.result.total).toBe(150);
    const priya = await as('priya');
    const notApprover = await call(priya, 'refunds-dashboard', { mode: 'preview', requestId: 7, method: 'getContext' });
    expect(notApprover.body.error.message).toMatch(/approvers/);
    db.prepare("UPDATE requests SET requester_id = 'marco' WHERE id = 7").run();
    const own = await call(marco, 'refunds-dashboard', { mode: 'preview', requestId: 7, method: 'getContext' });
    expect(own.body.error.message).toMatch(/own request/);
    db.prepare("UPDATE requests SET status = 'building' WHERE id = 7").run();
    const notReady = await call(marco, 'refunds-dashboard', { mode: 'preview', requestId: 7, method: 'getContext' });
    expect(notReady.body.error.code).toBe('forbidden');
    const live = await call(marco, 'refunds-dashboard', { method: 'getContext' });
    expect(live.body.error.code).toBe('not_found');
  });
});
