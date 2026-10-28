import type { Express } from 'express';
import { requireUser } from '../server/auth.js';
import type { DataConnector } from '../server/data/connector.js';
import type { Db } from '../server/db.js';
import { getRequest, listRequests, submitRequest } from '../server/requests/service.js';
import { sendError } from './catalog.js';

export function registerRequestRoutes(app: Express, db: Db, connector: DataConnector): void {
  app.get('/api/requests', requireUser(db), (req, res) => {
    res.json({ requests: listRequests(db, req.user!) });
  });

  app.post('/api/requests', requireUser(db), (req, res) => {
    try { res.status(201).json({ request: submitRequest(db, connector, req.user!, req.body) }); }
    catch (e) { sendError(res, e); }
  });

  app.get('/api/requests/:id', requireUser(db), (req, res) => {
    try {
      const r = getRequest(db, Number(req.params.id));
      const user = req.user!;
      if (user.role !== 'admin' && user.role !== 'approver' && r.requesterId !== user.id) { res.status(403).json({ error: 'Not your request' }); return; }
      res.json({ request: r });
    } catch (e) { sendError(res, e); }
  });
}
