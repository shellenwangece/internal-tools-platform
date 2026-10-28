import express, { type Express } from 'express';
import path from 'node:path';
import { getAppBySlug } from '../server/apps.js';
import { requireRole, requireUser } from '../server/auth.js';
import { BUNDLE_CSP, inlineDocument } from '../server/builds/store.js';
import { FakeGitHubClient } from '../server/github/client.js';
import { previewBuild, publishApp, unpublishApp, type PublishDeps } from '../server/requests/publish.js';
import { getRequest } from '../server/requests/service.js';
import { sendError } from './catalog.js';

export function registerPublishRoutes(app: Express, deps: PublishDeps): void {
  const { db } = deps;
  app.post('/api/requests/:id/preview', requireUser(db), async (req, res) => {
    try { res.json({ request: await previewBuild(deps, req.user!, Number(req.params.id)) }); } catch (e) { sendError(res, e); }
  });
  app.post('/api/requests/:id/publish', requireUser(db), async (req, res) => {
    try { res.json(await publishApp(deps, req.user!, Number(req.params.id))); } catch (e) { sendError(res, e); }
  });
  app.post('/api/admin/apps/:slug/unpublish', requireUser(db), requireRole('admin'), (req, res) => {
    try { res.json({ app: unpublishApp(db, req.user!, req.params.slug, String(req.body?.reason ?? '')) }); } catch (e) { sendError(res, e); }
  });
  if (deps.github instanceof FakeGitHubClient) {
    const gh = deps.github;
    app.post('/api/mock/github/merge/:id', requireUser(db), (req, res) => {
      const r = getRequest(db, Number(req.params.id));
      if (!r.prUrl) { res.status(409).json({ error: 'no PR' }); return; }
      gh.merge(r.prUrl);
      res.json({ ok: true });
    });
  }

  const staticFiles = (dir: string) => express.static(dir, { index: 'index.html', fallthrough: false, setHeaders: (r) => { r.setHeader('Content-Security-Policy', BUNDLE_CSP); r.setHeader('X-Frame-Options', 'SAMEORIGIN'); r.setHeader('Cache-Control', 'no-store'); } });
  const serve = (dir: string): express.RequestHandler => (req, res, next) => {
    if (!isDocument(req)) { staticFiles(dir)(req, res, next); return; }
    const doc = inlineDocument(dir);
    res.setHeader('Content-Security-Policy', doc.csp);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(doc.html);
  };

  // A sandboxed iframe has an opaque origin, so the browser sends no session cookie for its
  // script/style requests. Only the HTML document needs a login; static assets carry no data
  // (all data goes through the SDK bridge) and are served with CORS so module scripts load.
  const isDocument = (req: express.Request) => req.path === '/' || req.path === '/index.html';
  const userForDocument: express.RequestHandler = (req, res, next) => {
    if (isDocument(req)) { requireUser(db)(req, res, next); return; }
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  };

  app.use('/apps/:slug/live', userForDocument, (req, res, next) => {
    const a = getAppBySlug(db, req.params.slug);
    if (!a || a.kind !== 'built' || a.status !== 'live' || !a.liveSha) { res.status(404).send('App is not live'); return; }
    if (isDocument(req) && req.user!.role !== 'admin' && !a.teams.includes(req.user!.team)) { res.status(403).send('No access'); return; }
    if (!deps.bundles.has(a.slug, a.liveSha)) { res.status(404).send('Bundle missing'); return; }
    serve(deps.bundles.dir(a.slug, a.liveSha))(req, res, next);
  });

  app.use('/apps/:slug/preview/:requestId', userForDocument, (req, res, next) => {
    let r; try { r = getRequest(db, Number(req.params.requestId)); } catch { res.status(404).send('Not found'); return; }
    if (r.slug !== req.params.slug || r.status !== 'ready_for_review' || !r.previewSha) { res.status(404).send('No preview'); return; }
    const u = req.user;
    if (isDocument(req) && (!u || (u.role !== 'approver' && u.role !== 'admin') || r.requesterId === u.id)) { res.status(403).send('No access'); return; }
    if (!deps.bundles.has(r.slug, r.previewSha)) { res.status(404).send('Bundle missing'); return; }
    serve(deps.bundles.dir(r.slug, r.previewSha))(req, res, next);
  });

  // Other /apps/:slug paths are platform pages, handled by the SPA.
  app.use('/apps/:slug/preview', (_req, res) => { res.status(404).send('Not found'); });
  void path;
}
