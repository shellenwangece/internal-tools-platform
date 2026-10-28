import { appendAudit } from '../audit.js';
import type { User } from '../auth.js';
import type { Db } from '../db.js';
import type { Builder } from '../builds/builder.js';
import type { BundleStore } from '../builds/store.js';
import type { GitHubClient } from '../github/client.js';
import { getAppBySlug, rowToApp, type CatalogApp } from '../apps.js';
import { getRequest, RequestError, updateRequest, type AppRequest } from './service.js';

export interface PublishDeps { db: Db; github: GitHubClient; builder: Builder; bundles: BundleStore }

function repoOf(request: AppRequest): string {
  const m = /github\.com\/([^/]+\/[^/]+)/.exec(request.repoUrl ?? request.prUrl ?? '');
  if (!m) throw new RequestError(409, 'This request has no app repository yet');
  return m[1].replace(/\.git$/, '');
}

function assertReviewer(request: AppRequest, user: User): void {
  if (user.role !== 'approver' && user.role !== 'admin') throw new RequestError(403, 'Only approvers can review builds');
  if (request.requesterId === user.id) throw new RequestError(403, 'You cannot review your own request');
}

async function buildAndStore(deps: PublishDeps, request: AppRequest, sha: string, actorId: string, kind: 'preview' | 'publish'): Promise<void> {
  if (deps.bundles.has(request.slug, sha)) return;
  try {
    const { distDir } = await deps.builder.build(repoOf(request), sha);
    deps.bundles.save(request.slug, sha, distDir);
    appendAudit(deps.db, { actorId, action: 'build.preview_built', target: `request:${request.id}`, details: { sha, kind } });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    appendAudit(deps.db, { actorId, action: 'build.failed', target: `request:${request.id}`, details: { stage: kind, sha, reason } });
    throw new RequestError(502, `The app could not be built from its code: ${reason.split('\n')[0]}`);
  }
}

export async function previewBuild(deps: PublishDeps, user: User, id: number): Promise<AppRequest> {
  const request = getRequest(deps.db, id);
  assertReviewer(request, user);
  if (request.status !== 'ready_for_review') throw new RequestError(409, 'This build is not ready to preview');
  if (!request.prUrl) throw new RequestError(409, 'No pull request to preview');
  const pr = await deps.github.getPr(request.prUrl);
  const sha = pr.merged ? await deps.github.getBranchHeadSha(repoOf(request), pr.baseRef || 'main') : pr.headSha;
  await buildAndStore(deps, request, sha, user.id, 'preview');
  return updateRequest(deps.db, id, { preview_sha: sha });
}

export async function publishApp(deps: PublishDeps, user: User, id: number): Promise<{ request: AppRequest; app: CatalogApp }> {
  const request = getRequest(deps.db, id);
  assertReviewer(request, user);
  if (request.status !== 'ready_for_review') throw new RequestError(409, 'Only reviewed builds can be published');
  if (!request.prUrl) throw new RequestError(409, 'No pull request to publish');
  const pr = await deps.github.getPr(request.prUrl);
  if (!pr.merged) throw new RequestError(409, 'The pull request must be merged by an engineer before the app can be published');
  const repo = repoOf(request);
  const sha = await deps.github.getBranchHeadSha(repo, pr.baseRef || 'main');
  await buildAndStore(deps, request, sha, user.id, 'publish');
  const existing = getAppBySlug(deps.db, request.slug);
  const teams = JSON.stringify(request.teams); const grants = JSON.stringify(request.grants);
  const tx = deps.db.transaction(() => {
    if (existing) {
      deps.db.prepare("UPDATE apps SET name=?, description=?, teams_json=?, grants_json=?, repo=?, live_sha=?, status='live', owner=? WHERE id=?").run(request.name, request.description.slice(0, 400), teams, grants, repo, sha, request.requesterName, existing.id);
      return existing.id;
    }
    return Number(deps.db.prepare("INSERT INTO apps (slug, name, description, kind, owner, teams_json, grants_json, repo, live_sha, status) VALUES (?, ?, ?, 'built', ?, ?, ?, ?, ?, 'live')").run(request.slug, request.name, request.description.slice(0, 400), request.requesterName, teams, grants, repo, sha).lastInsertRowid);
  });
  const appId = tx();
  appendAudit(deps.db, { actorId: user.id, action: 'request.approved', target: `request:${id}`, details: { gate: 2, sha, prUrl: request.prUrl } });
  appendAudit(deps.db, { actorId: user.id, action: 'app.published', target: `app:${request.slug}`, details: { sha, repo, teams: request.teams, grants: request.grants } });
  const updated = updateRequest(deps.db, id, { status: 'live', app_id: appId, gate2_by: user.id, gate2_at: new Date().toISOString(), preview_sha: sha });
  return { request: updated, app: rowToApp(deps.db.prepare('SELECT * FROM apps WHERE id = ?').get(appId) as Record<string, unknown>) };
}

export function unpublishApp(db: Db, user: User, slug: string, reason: string): CatalogApp {
  const app = getAppBySlug(db, slug);
  if (!app || app.kind !== 'built') throw new RequestError(404, 'App not found');
  if (app.status !== 'live') throw new RequestError(409, 'This app is not live');
  db.prepare("UPDATE apps SET status='unpublished' WHERE id=?").run(app.id);
  db.prepare("UPDATE requests SET status='unpublished', updated_at=CURRENT_TIMESTAMP WHERE app_id=? AND status='live'").run(app.id);
  appendAudit(db, { actorId: user.id, action: 'app.unpublished', target: `app:${slug}`, details: { reason, sha: app.liveSha } });
  return getAppBySlug(db, slug)!;
}
