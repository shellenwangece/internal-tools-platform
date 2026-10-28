import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/index.js';
import { seedDemo } from '../server/seed.js';

describe('dataset routes', () => {
  let db: ReturnType<typeof openDb>;
  beforeEach(() => { db = openDb(':memory:'); seedDemo(db); });
  afterEach(() => db.close());

  it('lists datasets with sample rows for a logged-in user and lets admins reset', async () => {
    const app = createApp({ db, config: loadConfig({ SESSION_SECRET: 'test-session-secret' }) });
    const anon = await request(app).get('/api/datasets');
    expect(anon.status).toBe(401);

    const priya = request.agent(app);
    await priya.post('/api/auth/login').send({ userId: 'priya' });
    const list = await priya.get('/api/datasets');
    expect(list.status).toBe(200);
    expect(list.body.datasets).toHaveLength(4);
    expect(list.body.datasets[0].sample).toHaveLength(3);
    expect(list.body.datasets[0].rowCount).toBe(120);
    expect((await priya.post('/api/admin/datasets/reset')).status).toBe(403);

    const ava = request.agent(app);
    await ava.post('/api/auth/login').send({ userId: 'ava' });
    expect((await ava.post('/api/admin/datasets/reset')).status).toBe(200);
    const audit = await ava.get('/api/audit');
    const entries = Array.isArray(audit.body) ? audit.body : audit.body.entries;
    expect(entries.some((e: { action: string }) => e.action === 'admin.data_reset')).toBe(true);
  });
});
