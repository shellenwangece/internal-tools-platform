import type { Express } from 'express';
import { appendAudit } from '../server/audit.js';
import { requireRole, requireUser } from '../server/auth.js';
import type { CsvConnector } from '../server/data/csvConnector.js';
import type { Db } from '../server/db.js';

export function registerDatasetRoutes(app: Express, db: Db, connector: CsvConnector): void {
  app.get('/api/datasets', requireUser(db), (_req, res) => {
    const datasets = connector.listDatasets().map((ds) => ({
      ...ds,
      rowCount: connector.query(ds.name, { limit: 1 }).total,
      sample: connector.sample(ds.name, 3),
    }));
    res.json({ datasets });
  });

  app.post('/api/admin/datasets/reset', requireUser(db), requireRole('admin'), (req, res) => {
    connector.reset();
    appendAudit(db, { actorId: req.user!.id, action: 'admin.data_reset', target: 'datasets', details: {} });
    res.json({ ok: true });
  });
}
