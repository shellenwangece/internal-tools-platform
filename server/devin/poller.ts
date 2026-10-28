import { appendAudit } from '../audit.js';
import type { Db } from '../db.js';
import { getRequest, updateRequest, type AppRequest } from '../requests/service.js';
import type { DevinClient, DevinSession } from './client.js';

export function applySession(db: Db, request: AppRequest, s: DevinSession): AppRequest {
  const changed = request.devinStatus !== s.status || request.devinStatusDetail !== s.statusDetail;
  if (changed) appendAudit(db, { actorId: null, action: 'devin.status_changed', target: `request:${request.id}`, details: { from: `${request.devinStatus}/${request.devinStatusDetail}`, to: `${s.status}/${s.statusDetail}` } });
  const base = { devin_status: s.status, devin_status_detail: s.statusDetail };
  const pr = s.pullRequests[0]?.prUrl || s.structuredOutput?.pr_url || null;
  const repo = s.structuredOutput?.repo_url ?? (pr ? pr.replace(/\/pull\/\d+.*$/, '') : null);
  const finished = s.status === 'exit' || s.statusDetail === 'finished';
  if (finished && pr) {
    appendAudit(db, { actorId: null, action: 'build.ready', target: `request:${request.id}`, details: { prUrl: pr, repoUrl: repo, summary: s.structuredOutput?.summary ?? '' } });
    return updateRequest(db, request.id, { ...base, status: 'ready_for_review', pr_url: pr, repo_url: repo, failure_reason: null });
  }
  if (finished) return fail(db, request, base, 'Devin finished without opening a pull request.');
  if (s.status === 'error') return fail(db, request, base, 'Devin hit an error while building.');
  if (s.status === 'suspended') return fail(db, request, base, 'The build was paused: the Devin session ran out of its budget or was suspended.');
  return updateRequest(db, request.id, { ...base, pr_url: pr, repo_url: repo });
}

function fail(db: Db, request: AppRequest, base: Record<string, string | null>, reason: string): AppRequest {
  appendAudit(db, { actorId: null, action: 'build.failed', target: `request:${request.id}`, details: { stage: 'devin', reason } });
  return updateRequest(db, request.id, { ...base, status: 'build_failed', failure_reason: reason });
}

export async function pollOnce(db: Db, devin: DevinClient): Promise<void> {
  const rows = db.prepare("SELECT id FROM requests WHERE status = 'building' AND devin_session_id IS NOT NULL").all() as { id: number }[];
  for (const { id } of rows) {
    const request = getRequest(db, id);
    try {
      const s = await devin.getSession(request.devinSessionId!);
      applySession(db, request, s);
    } catch (e) {
      process.stderr.write(`poll ${request.devinSessionId} failed: ${e instanceof Error ? e.message : e}\n`);
    }
  }
}

export function startPoller(db: Db, devin: DevinClient, intervalMs = 15000): () => void {
  const timer = setInterval(() => { void pollOnce(db, devin); }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
