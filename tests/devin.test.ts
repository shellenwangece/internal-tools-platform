import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../server/config.js';
import { CsvConnector } from '../server/data/csvConnector.js';
import { openDb } from '../server/db.js';
import { FakeDevinClient, HttpDevinClient, type DevinSession } from '../server/devin/client.js';
import { applySession, pollOnce } from '../server/devin/poller.js';
import { buildPrompt } from '../server/devin/prompt.js';
import { createApp } from '../server/index.js';
import { narrowGrants } from '../server/requests/approval.js';
import { getRequest, RequestError } from '../server/requests/service.js';
import { seedDemo } from '../server/seed.js';
import path from 'node:path';

const valid = { name: 'Refunds Dashboard', description: 'Show pending refunds with amounts and let support approve or deny them.', teams: ['Support'], grants: [{ dataset: 'refunds', permission: 'write' }, { dataset: 'customers', permission: 'read' }] };
const config = loadConfig({ SESSION_SECRET: 'test-session-secret', DEVIN_MOCK: '1' });

describe('gate 1 and Devin orchestration', () => {
  let db: ReturnType<typeof openDb>;
  let devin: FakeDevinClient;
  let app: ReturnType<typeof createApp>;
  const as = async (id: string) => { const a = request.agent(app); await a.post('/api/auth/login').send({ userId: id }); return a; };
  beforeEach(() => { db = openDb(':memory:'); seedDemo(db); devin = new FakeDevinClient(2); app = createApp({ db, config, devin }); });
  afterEach(() => db.close());

  it('prompt carries the skill name, slug, repo, grants, requirement and samples', () => {
    const connector = new CsvConnector(db, path.resolve('data')); connector.loadIfEmpty();
    db.prepare(`INSERT INTO requests (id, requester_id, name, slug, description, teams_json, grants_json, status) VALUES (1,'priya','Refunds Dashboard','refunds-dashboard','Show pending refunds.','["Support"]','[{"dataset":"refunds","permission":"write"}]','pending_review')`).run();
    const prompt = buildPrompt(getRequest(db, 1), connector, config);
    for (const needle of ['new-internal-app', 'slug: refunds-dashboard', 'target_repo: shellenwangece/itp-app-refunds-dashboard', 'template_repo: shellenwangece/itp-app-template', 'audience_teams: [Support]', '{ dataset: refunds, permission: write }', 'Show pending refunds.', 'Primary key: refund_id', '"refund_id":"RF-3001"']) expect(prompt).toContain(needle);
  });

  it('only approvers who are not the requester can approve; approval narrows grants and starts a build', async () => {
    const priya = await as('priya');
    const { body } = await priya.post('/api/requests').send(valid);
    const id = body.request.id;
    expect((await priya.post(`/api/requests/${id}/approve`).send({})).status).toBe(403);
    expect((await (await as('sam')).post(`/api/requests/${id}/approve`).send({})).status).toBe(403);
    const marco = await as('marco');
    const widen = await marco.post(`/api/requests/${id}/approve`).send({ grants: [{ dataset: 'customers', permission: 'write' }] });
    expect(widen.status).toBe(400);
    const ok = await marco.post(`/api/requests/${id}/approve`).send({ grants: [{ dataset: 'refunds', permission: 'read' }], comment: 'Read-only first' });
    expect(ok.status).toBe(200);
    expect(ok.body.request).toMatchObject({ status: 'building', grants: [{ dataset: 'refunds', permission: 'read' }], gate1By: 'marco', devinSessionId: 'devin-mock-1' });
    expect(devin.sessions.get('devin-mock-1')!.prompt).toContain('{ dataset: refunds, permission: read }');
    expect((await marco.post(`/api/requests/${id}/approve`).send({})).status).toBe(409);
    const actions = (await (await as('ava')).get('/api/audit')).body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['request.grants_edited', 'request.approved', 'devin.session_started']));
  });

  it('reject records gate 1 rejection', async () => {
    const priya = await as('priya');
    const { body } = await priya.post('/api/requests').send(valid);
    const marco = await as('marco');
    const r = await marco.post(`/api/requests/${body.request.id}/reject`).send({ comment: 'Not now' });
    expect(r.body.request).toMatchObject({ status: 'rejected', gate1Comment: 'Not now' });
  });

  it('narrowGrants refuses widening and unknown datasets', () => {
    const req = [{ dataset: 'refunds', permission: 'read' as const }];
    expect(() => narrowGrants(req, [{ dataset: 'refunds', permission: 'write' }])).toThrow(RequestError);
    expect(() => narrowGrants(req, [{ dataset: 'kyc_cases', permission: 'read' }])).toThrow(/not part/);
    expect(() => narrowGrants(req, [])).toThrow(/at least one/);
  });

  it('poller: finished with PR -> ready_for_review; mock finishes after 2 polls', async () => {
    const priya = await as('priya');
    const { body } = await priya.post('/api/requests').send(valid);
    await (await as('marco')).post(`/api/requests/${body.request.id}/approve`).send({});
    await pollOnce(db, devin);
    expect(getRequest(db, body.request.id).status).toBe('building');
    await pollOnce(db, devin);
    const r = getRequest(db, body.request.id);
    expect(r).toMatchObject({ status: 'ready_for_review', prUrl: 'https://github.com/shellenwangece/itp-app-refunds-dashboard/pull/1', repoUrl: 'https://github.com/shellenwangece/itp-app-refunds-dashboard' });
  });

  it('poller: every other outcome maps to a readable state', () => {
    db.prepare(`INSERT INTO requests (id, requester_id, name, slug, description, teams_json, grants_json, status, devin_session_id, devin_status) VALUES (9,'priya','X','x-app','desc','["Support"]','[]','building','d1','running')`).run();
    const base: DevinSession = { sessionId: 'd1', url: '', status: 'running', statusDetail: 'working', pullRequests: [], structuredOutput: null };
    const reset = () => db.prepare("UPDATE requests SET status='building', failure_reason=NULL WHERE id=9").run();
    expect(applySession(db, getRequest(db, 9), { ...base, status: 'exit', statusDetail: 'finished' })).toMatchObject({ status: 'build_failed', failureReason: expect.stringContaining('without opening a pull request') });
    reset();
    expect(applySession(db, getRequest(db, 9), { ...base, status: 'error' })).toMatchObject({ status: 'build_failed', failureReason: expect.stringContaining('error') });
    reset();
    expect(applySession(db, getRequest(db, 9), { ...base, status: 'suspended' })).toMatchObject({ status: 'build_failed', failureReason: expect.stringContaining('budget') });
    reset();
    expect(applySession(db, getRequest(db, 9), { ...base, statusDetail: 'waiting_for_user' })).toMatchObject({ status: 'building', devinStatusDetail: 'waiting_for_user' });
  });

  it('HTTP client posts to the org sessions endpoint with a bearer token and omits playbook_id', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ session_id: 'devin-1', url: 'https://app.devin.ai/sessions/devin-1', status: 'running', status_detail: 'working', pull_requests: [{ pr_url: 'https://github.com/o/r/pull/2', pr_state: 'open' }] }), { status: 200 }); }) as unknown as typeof fetch;
    const client = new HttpDevinClient('KEY', 'org-1', fetchFn);
    const created = await client.createSession({ prompt: 'p', title: 't', tags: ['a'], maxAcuLimit: 15 });
    expect(created).toEqual({ sessionId: 'devin-1', url: 'https://app.devin.ai/sessions/devin-1' });
    expect(calls[0].url).toBe('https://api.devin.ai/v3/organizations/org-1/sessions');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer KEY');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ prompt: 'p', title: 't', tags: ['a'], max_acu_limit: 15 });
    const s = await client.getSession('devin-1');
    expect(s.pullRequests).toEqual([{ prUrl: 'https://github.com/o/r/pull/2', prState: 'open' }]);
  });
});

describe('gate 1 creates the app repo before starting Devin', () => {
  it('creates itp-app-<slug> from the template once and records it', async () => {
    const { FakeGitHubClient } = await import('../server/github/client.js');
    const { openDb } = await import('../server/db.js');
    const { seedDemo } = await import('../server/seed.js');
    const { loadConfig } = await import('../server/config.js');
    const { createApp } = await import('../server/index.js');
    const { default: request } = await import('supertest');
    const db = openDb(':memory:'); seedDemo(db);
    const gh = new FakeGitHubClient();
    const app = createApp({ db, config: loadConfig({ SESSION_SECRET: 's', DEVIN_MOCK: '1', GITHUB_MOCK: '1' }), github: gh });
    const priya = request.agent(app); await priya.post('/api/auth/login').send({ userId: 'priya' });
    const sub = await priya.post('/api/requests').send({ name: 'Refunds Dashboard', description: 'Support needs to see pending refunds and approve them.', teams: ['Support'], grants: [{ dataset: 'refunds', permission: 'read' }] });
    const marco = request.agent(app); await marco.post('/api/auth/login').send({ userId: 'marco' });
    const ok = await marco.post(`/api/requests/${sub.body.request.id}/approve`).send({});
    expect(ok.body.request.status).toBe('building');
    expect(ok.body.request.repoUrl).toBe('https://github.com/shellenwangece/itp-app-refunds-dashboard');
    expect(gh.created).toEqual(['shellenwangece/itp-app-refunds-dashboard']);
    const ava = request.agent(app); await ava.post('/api/auth/login').send({ userId: 'ava' });
    const actions = (await ava.get('/api/audit')).body.map((e: { action: string }) => e.action);
    expect(actions).toContain('github.repo_created');
    expect(actions).toContain('devin.session_started');
    db.close();
  });
});
