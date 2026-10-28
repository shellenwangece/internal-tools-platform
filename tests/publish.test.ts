import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanBuildEnv, FakeBuilder } from '../server/builds/builder.js';
import { BUNDLE_CSP, BundleStore } from '../server/builds/store.js';
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db.js';
import { FakeGitHubClient } from '../server/github/client.js';
import { createApp } from '../server/index.js';
import { seedDemo } from '../server/seed.js';

describe('preview, publish, unpublish', () => {
  let db: ReturnType<typeof openDb>; let app: ReturnType<typeof createApp>; let gh: FakeGitHubClient; let tmp: string;
  const as = async (id: string) => { const a = request.agent(app); await a.post('/api/auth/login').send({ userId: id }); return a; };
  const PR = 'https://github.com/shellenwangece/itp-app-refunds-dashboard/pull/1';
  beforeEach(() => {
    db = openDb(':memory:'); seedDemo(db); gh = new FakeGitHubClient(); tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'itp-bundles-'));
    app = createApp({ db, config: loadConfig({ SESSION_SECRET: 's', DEVIN_MOCK: '1', GITHUB_MOCK: '1' }), github: gh, builder: new FakeBuilder(), bundles: new BundleStore(tmp) });
    db.prepare(`INSERT INTO requests (id, requester_id, name, slug, description, teams_json, grants_json, status, pr_url, repo_url) VALUES (5,'priya','Refunds Dashboard','refunds-dashboard','desc','["Support"]','[{"dataset":"refunds","permission":"read"}]','ready_for_review','${PR}','https://github.com/shellenwangece/itp-app-refunds-dashboard')`).run();
  });
  afterEach(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('preview builds the PR head and serves it with the sandbox CSP; publish needs a merged PR and uses main', async () => {
    const marco = await as('marco');
    expect((await (await as('priya')).post('/api/requests/5/preview')).status).toBe(403);
    const prev = await marco.post('/api/requests/5/preview');
    expect(prev.status).toBe(200);
    expect(prev.body.request.previewSha).toBe('a'.repeat(40));
    const page = await marco.get('/apps/refunds-dashboard/preview/5/');
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toBe(BUNDLE_CSP);
    expect(page.text).toContain('Mock app itp-app-refunds-dashboard');
    expect((await (await as('sam')).get('/apps/refunds-dashboard/preview/5/')).status).toBe(403);

    const early = await marco.post('/api/requests/5/publish');
    expect(early.status).toBe(409);
    expect(early.body.error).toMatch(/merged/);
    await marco.post('/api/mock/github/merge/5');
    const pub = await marco.post('/api/requests/5/publish');
    expect(pub.status).toBe(200);
    expect(pub.body.app).toMatchObject({ slug: 'refunds-dashboard', status: 'live', liveSha: 'b'.repeat(40), teams: ['Support'], grants: [{ dataset: 'refunds', permission: 'read' }] });
    expect(pub.body.request.status).toBe('live');

    const sam = await as('sam');
    const live = await sam.get('/apps/refunds-dashboard/live/');
    expect(live.status).toBe(200);
    expect(live.text).toContain('bbbbbbb');
    expect((await (await as('lena')).get('/apps/refunds-dashboard/live/')).status).toBe(403);
    expect((await sam.get('/apps/refunds-dashboard/live/../../etc/passwd')).status).not.toBe(200);

    const ava = await as('ava');
    const un = await ava.post('/api/admin/apps/refunds-dashboard/unpublish').send({ reason: 'bug' });
    expect(un.body.app.status).toBe('unpublished');
    expect((await sam.get('/apps/refunds-dashboard/live/')).status).toBe(404);
    const actions = (await ava.get('/api/audit')).body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['build.preview_built', 'app.published', 'app.unpublished']));
  });

  it('builder env carries no platform secrets', () => {
    process.env.DEVIN_API_KEY_TEST_CANARY = 'x';
    const env = cleanBuildEnv();
    expect(Object.keys(env).sort()).toEqual(['CI', 'HOME', 'PATH', 'npm_config_update_notifier']);
    delete process.env.DEVIN_API_KEY_TEST_CANARY;
  });
});
