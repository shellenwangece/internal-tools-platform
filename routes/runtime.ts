import type { Express } from 'express';
import { requireUser } from '../server/auth.js';
import type { DataConnector } from '../server/data/connector.js';
import type { Db } from '../server/db.js';
import { handleSdkCall } from '../server/runtime/handler.js';

export function registerRuntimeRoutes(app: Express, db: Db, connector: DataConnector): void {
  app.post('/api/runtime/:slug/call', requireUser(db), (req, res) => {
    const result = handleSdkCall(db, connector, req.user!, req.params.slug, req.body);
    res.status(200).json(result);
  });
}
