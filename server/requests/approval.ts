import { appendAudit } from '../audit.js';
import type { User } from '../auth.js';
import type { Config } from '../config.js';
import type { DataConnector } from '../data/connector.js';
import type { GitHubClient } from '../github/client.js';
import type { Db } from '../db.js';
import type { DevinClient } from '../devin/client.js';
import { buildPrompt } from '../devin/prompt.js';
import { getRequest, normalizeGrants, RequestError, updateRequest, type AppRequest, type Grant } from './service.js';

export interface ApprovalDeps { db: Db; connector: DataConnector; devin: DevinClient; config: Config; github?: GitHubClient }

function assertApprover(request: AppRequest, user: User): void {
  if (user.role !== 'approver' && user.role !== 'admin') throw new RequestError(403, 'Only approvers can review requests');
  if (request.requesterId === user.id) throw new RequestError(403, 'You cannot review your own request');
}

/** Approved grants may only be narrower than what was requested. */
export function narrowGrants(requested: Grant[], approved: Grant[]): Grant[] {
  for (const g of approved) {
    const orig = requested.find((r) => r.dataset === g.dataset);
    if (!orig) throw new RequestError(400, `Dataset "${g.dataset}" was not part of the request`);
    if (orig.permission === 'read' && g.permission === 'write') throw new RequestError(400, `"${g.dataset}" was requested as view-only; it cannot be widened`);
  }
  if (approved.length === 0) throw new RequestError(400, 'Approve at least one dataset, or reject the request');
  return approved;
}

export async function startBuild(deps: ApprovalDeps, request: AppRequest, actorId: string): Promise<AppRequest> {
  const prompt = buildPrompt(request, deps.connector, deps.config);
  const targetRepo = `${deps.config.GITHUB_OWNER}/itp-app-${request.slug}`;
  try {
    if (deps.github) {
      const repo = await deps.github.createRepoFromTemplate(deps.config.TEMPLATE_REPO, targetRepo, `${request.name} (Internal Tools Platform app)`);
      if (repo.created) appendAudit(deps.db, { actorId, action: 'github.repo_created', target: `request:${request.id}`, details: { repo: targetRepo, template: deps.config.TEMPLATE_REPO } });
      updateRequest(deps.db, request.id, { repo_url: repo.url });
    }
    const { sessionId, url } = await deps.devin.createSession({
      prompt,
      title: `ITP build: ${request.name}`,
      tags: ['internal-tools-platform', request.slug],
      maxAcuLimit: deps.config.DEVIN_MAX_ACU,
    });
    appendAudit(deps.db, { actorId, action: 'devin.session_started', target: `request:${request.id}`, details: { sessionId, url, maxAcu: deps.config.DEVIN_MAX_ACU } });
    return updateRequest(deps.db, request.id, { status: 'building', devin_session_id: sessionId, devin_url: url, devin_status: 'new', devin_status_detail: null, failure_reason: null });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    appendAudit(deps.db, { actorId, action: 'build.failed', target: `request:${request.id}`, details: { stage: 'start', reason } });
    return updateRequest(deps.db, request.id, { status: 'build_failed', failure_reason: `Could not start the build: ${reason}` });
  }
}

export async function approveRequest(deps: ApprovalDeps, user: User, id: number, input: { grants?: Grant[]; comment?: string }): Promise<AppRequest> {
  const request = getRequest(deps.db, id);
  assertApprover(request, user);
  if (request.status !== 'pending_review') throw new RequestError(409, 'This request has already been reviewed');
  let grants = request.grants;
  if (input.grants) {
    grants = narrowGrants(request.grants, normalizeGrants(input.grants, deps.connector));
    if (JSON.stringify(grants) !== JSON.stringify(request.grants)) {
      appendAudit(deps.db, { actorId: user.id, action: 'request.grants_edited', target: `request:${id}`, details: { from: request.grants, to: grants } });
      updateRequest(deps.db, id, { grants_json: JSON.stringify(grants) });
    }
  }
  appendAudit(deps.db, { actorId: user.id, action: 'request.approved', target: `request:${id}`, details: { gate: 1, grants, comment: input.comment ?? '' } });
  const approved = updateRequest(deps.db, id, { gate1_by: user.id, gate1_at: new Date().toISOString(), gate1_comment: input.comment ?? null });
  return startBuild(deps, approved, user.id);
}

export function rejectRequest(db: Db, user: User, id: number, comment: string): AppRequest {
  const request = getRequest(db, id);
  assertApprover(request, user);
  if (request.status !== 'pending_review') throw new RequestError(409, 'This request has already been reviewed');
  appendAudit(db, { actorId: user.id, action: 'request.rejected', target: `request:${id}`, details: { gate: 1, comment } });
  return updateRequest(db, id, { status: 'rejected', gate1_by: user.id, gate1_at: new Date().toISOString(), gate1_comment: comment });
}

export async function retryBuild(deps: ApprovalDeps, user: User, id: number): Promise<AppRequest> {
  const request = getRequest(deps.db, id);
  assertApprover(request, user);
  if (request.status !== 'build_failed') throw new RequestError(409, 'Only failed builds can be retried');
  return startBuild(deps, request, user.id);
}
