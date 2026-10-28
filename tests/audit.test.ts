import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendAudit, verifyAuditChain } from '../server/audit.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { seedDemo } from '../server/seed.js';
import { createApp } from '../server/index.js';

describe('audit log', () => {
  let db: ReturnType<typeof openDb>;

  beforeEach(() => {
    db = openDb(':memory:');
    seedDemo(db);
  });

  afterEach(() => {
    db.close();
  });

  it('verifies a chain of appended audit events', () => {
    appendAudit(db, { actorId: 'priya', action: 'request.submitted', target: 'request:1' });
    appendAudit(db, { actorId: 'marco', action: 'request.approved', target: 'request:1', details: { gate: 1 } });
    appendAudit(db, { actorId: null, action: 'devin.session_started', target: 'request:1' });

    expect(verifyAuditChain(db)).toEqual({ ok: true });
  });

  it('identifies an invalid second entry without changing an existing audit row', () => {
    appendAudit(db, { actorId: 'priya', action: 'request.submitted', target: 'request:1' });
    db.prepare(`
      INSERT INTO audit_log (ts, actor_id, action, target, details_json, prev_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('2026-10-27T12:00:00.000Z', 'marco', 'request.approved', 'request:1', '{}', 'invalid-parent', '0'.repeat(64));

    expect(verifyAuditChain(db)).toEqual({ ok: false, brokenAtId: 2 });
  });

  it('exports the required CSV header for admins', async () => {
    const app = createApp({
      db,
      config: loadConfig({ SESSION_SECRET: 'audit-test-secret' }),
    });
    const client = request.agent(app);
    await client.post('/api/auth/login').send({ userId: 'ava' });
    appendAudit(db, { actorId: 'ava', action: 'app.external_registered', target: 'app:example' });

    const response = await client.get('/api/audit/export.csv');

    expect(response.status).toBe(200);
    expect(response.text.split(/\r?\n/, 1)[0]).toBe('id,ts,actor,action,target,details,hash');
  });
});
