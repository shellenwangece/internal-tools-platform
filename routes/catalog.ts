import type { Express } from 'express';
import { getAppBySlug, listCatalog, registerExternalApp } from '../server/apps.js';
import { requireRole, requireUser } from '../server/auth.js';
import type { Db } from '../server/db.js';
import { RequestError } from '../server/requests/service.js';

export function sendError(res: import('express').Response, e: unknown): void {
  if (e instanceof RequestError) { res.status(e.status).json({ error: e.message }); return; }
  throw e;
}

export function registerCatalogRoutes(app: Express, db: Db): void {
  app.get('/api/apps', requireUser(db), (req, res) => {
    res.json({ apps: listCatalog(db, req.user!) });
  });

  app.get('/api/apps/:slug', requireUser(db), (req, res) => {
    const found = getAppBySlug(db, req.params.slug);
    if (!found) { res.status(404).json({ error: 'App not found' }); return; }
    const visible = listCatalog(db, req.user!).some((a) => a.slug === found.slug);
    if (!visible) { res.status(403).json({ error: 'You do not have access to this app' }); return; }
    res.json({ app: found });
  });

  app.post('/api/admin/apps/external', requireUser(db), requireRole('admin'), (req, res) => {
    try { res.status(201).json({ app: registerExternalApp(db, req.user!, req.body) }); }
    catch (e) { sendError(res, e); }
  });
}
