import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionMiddleware, requireRole, requireUser } from '../server/auth.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { seedDemo } from '../server/seed.js';
import { createApp } from '../server/index.js';

describe('demo login', () => {
  let db: ReturnType<typeof openDb>;
  let config: ReturnType<typeof loadConfig>;

  beforeEach(() => {
    db = openDb(':memory:');
    seedDemo(db);
    config = loadConfig({ SESSION_SECRET: 'test-session-secret' });
  });

  afterEach(() => {
    db.close();
  });

  it('logs in as Priya and returns her role and team', async () => {
    const app = createApp({ db, config });
    const client = request.agent(app);

    const login = await client.post('/api/auth/login').send({ userId: 'priya' });
    const me = await client.get('/api/me');

    expect(login.status).toBe(200);
    expect(me.body).toMatchObject({
      name: 'Priya Shah',
      role: 'requester',
      team: 'Compliance',
    });
  });

  it('returns 401 when no demo user is logged in', async () => {
    const app = createApp({ db, config });
    const response = await request(app).get('/api/me');

    expect(response.status).toBe(401);
  });

  it('returns 403 when Priya uses an admin-only route', async () => {
    const app = createApp({ db, config });
    const login = await request(app).post('/api/auth/login').send({ userId: 'priya' });
    const protectedApp = express();

    protectedApp.use(createSessionMiddleware(config));
    protectedApp.use(requireUser(db));
    protectedApp.get('/admin', requireRole('admin'), (_req, res) => res.sendStatus(204));

    const response = await request(protectedApp)
      .get('/admin')
      .set('Cookie', login.headers['set-cookie']);

    expect(response.status).toBe(403);
  });
});
