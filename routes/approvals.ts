import type { Express } from 'express';
import { requireUser } from '../server/auth.js';
import { approveRequest, rejectRequest, retryBuild, type ApprovalDeps } from '../server/requests/approval.js';
import { sendError } from './catalog.js';

export function registerApprovalRoutes(app: Express, deps: ApprovalDeps): void {
  app.post('/api/requests/:id/approve', requireUser(deps.db), async (req, res) => {
    try { res.json({ request: await approveRequest(deps, req.user!, Number(req.params.id), req.body ?? {}) }); }
    catch (e) { sendError(res, e); }
  });
  app.post('/api/requests/:id/reject', requireUser(deps.db), (req, res) => {
    try { res.json({ request: rejectRequest(deps.db, req.user!, Number(req.params.id), String(req.body?.comment ?? '')) }); }
    catch (e) { sendError(res, e); }
  });
  app.post('/api/requests/:id/retry', requireUser(deps.db), async (req, res) => {
    try { res.json({ request: await retryBuild(deps, req.user!, Number(req.params.id)) }); }
    catch (e) { sendError(res, e); }
  });
}
