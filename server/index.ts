import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { registerAuditRoutes } from '../routes/audit.js';
import { registerAuthRoutes } from '../routes/auth.js';
import { registerDatasetRoutes } from '../routes/datasets.js';
import { CsvConnector } from './data/csvConnector.js';
import { createSessionMiddleware, requireUser } from './auth.js';
import { loadConfig, type Config } from './config.js';
import { openDb, type Db } from './db.js';
import { seedDemo } from './seed.js';

export interface AppDependencies {
  db: Db;
  config: Config;
  connector?: CsvConnector;
  devin?: unknown;
  github?: unknown;
  builder?: unknown;
}

export function createApp({ db, config, connector }: AppDependencies): express.Express {
  const app = express();
  const data = connector ?? new CsvConnector(db, path.resolve('data'));
  data.loadIfEmpty();
  app.use(express.json({ limit: '1mb' }));
  app.use(createSessionMiddleware(config));
  registerAuthRoutes(app, db);
  registerAuditRoutes(app, db);
  registerDatasetRoutes(app, db, data);
  app.get('/api/me', requireUser(db), (req, res) => {
    const { id, name, role, team } = req.user!;
    res.json({ id, name, role, team });
  });
  return app;
}

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const dbPath = path.resolve(process.env.DATABASE_PATH ?? 'var/platform.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  seedDemo(db);
  const app = createApp({ db, config });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      configFile: path.resolve('vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
  }

  const server = app.listen(3000, '0.0.0.0', () => {
    process.stdout.write('Internal Tools Platform listening on http://localhost:3000\n');
  });
  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void startServer();
}
