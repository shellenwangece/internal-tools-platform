import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/index.js';
import { seedDemo } from '../server/seed.js';

const valid = {
  name: 'Refunds Dashboard',
  description: 'Show pending refunds with amounts and let support approve or deny them.',
  teams: ['Support'],
  grants: [{ dataset: 'refunds', permission: 'write' }, { dataset: 'customers', permission: 'read' }],
};

describe('catalog and app requests', () => {
  let db: ReturnType<typeof openDb>;
  let app: ReturnType<typeof createApp>;
  const as = async (id: string) => { const a = request.agent(app); await a.post('/api/auth/login').send({ userId: id }); return a; };
  beforeEach(() => { db = openDb(':memory:'); seedDemo(db); app = createApp({ db, config: loadConfig({ SESSION_SECRET: 'test-session-secret' }) }); });
  afterEach(() => db.close());

  it('requester submits a request; duplicates get a suffixed slug', async () => {
    const priya = await as('priya');
    const first = await priya.post('/api/requests').send(valid);
    expect(first.status).toBe(201);
    expect(first.body.request).toMatchObject({ slug: 'refunds-dashboard', status: 'pending_review', requesterName: 'Priya Shah' });
    const second = await priya.post('/api/requests').send(valid);
    expect(second.body.request.slug).toBe('refunds-dashboard-2');
    const list = await priya.get('/api/requests');
    expect(list.body.requests).toHaveLength(2);
  });

  it('validates input and dataset names', async () => {
    const priya = await as('priya');
    expect((await priya.post('/api/requests').send({ ...valid, description: 'too short' })).status).toBe(400);
    expect((await priya.post('/api/requests').send({ ...valid, grants: [] })).status).toBe(400);
    const bad = await priya.post('/api/requests').send({ ...valid, grants: [{ dataset: 'salaries', permission: 'read' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/Unknown dataset/);
  });

  it('app users cannot submit requests or see others requests', async () => {
    const sam = await as('sam');
    expect((await sam.post('/api/requests').send(valid)).status).toBe(403);
    const priya = await as('priya');
    const { body } = await priya.post('/api/requests').send(valid);
    expect((await sam.get(`/api/requests/${body.request.id}`)).status).toBe(403);
    const marco = await as('marco');
    expect((await marco.get(`/api/requests/${body.request.id}`)).status).toBe(200);
  });

  it('catalog starts empty and lets admins register external apps', async () => {
    const sam = await as('sam');
    const before = await sam.get('/api/apps');
    expect(before.body.apps).toEqual([]);
    expect((await sam.post('/api/admin/apps/external').send({})).status).toBe(403);
    const ava = await as('ava');
    const created = await ava.post('/api/admin/apps/external').send({ name: 'Payroll Portal', url: 'https://payroll.example.com', owner: 'Finance', teams: ['Engineering'] });
    expect(created.status).toBe(201);
    expect(created.body.app.slug).toBe('ext-payroll-portal');
    expect((await sam.get('/api/apps')).body.apps).toHaveLength(1);
  });
});
