import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { registerAuditRoutes } from '../routes/audit.js';
import { registerAuthRoutes } from '../routes/auth.js';
import { registerDatasetRoutes } from '../routes/datasets.js';
import { registerCatalogRoutes } from '../routes/catalog.js';
import { registerRequestRoutes } from '../routes/requests.js';
import { registerRuntimeRoutes } from '../routes/runtime.js';
import { registerApprovalRoutes } from '../routes/approvals.js';
import { registerPublishRoutes } from '../routes/publish.js';
import { registerAdminRoutes } from '../routes/admin.js';
import { FakeBuilder, RepoBuilder, type Builder } from './builds/builder.js';
import { BundleStore } from './builds/store.js';
import { FakeGitHubClient, HttpGitHubClient, type GitHubClient } from './github/client.js';
import { FakeDevinClient, HttpDevinClient, type DevinClient } from './devin/client.js';
import { startPoller } from './devin/poller.js';
import { CsvConnector } from './data/csvConnector.js';
import { createSessionMiddleware, requireUser } from './auth.js';
import { loadConfig, type Config } from './config.js';
import { openDb, type Db } from './db.js';
import { seedDemo } from './seed.js';

export interface AppDependencies {
  db: Db;
  config: Config;
  connector?: CsvConnector;
  devin?: DevinClient;
  github?: GitHubClient;
  builder?: Builder;
  bundles?: BundleStore;
}

export function makeDevinClient(config: Config): DevinClient {
  if (config.DEVIN_MOCK === '1' || !config.DEVIN_API_KEY || !config.DEVIN_ORG_ID) return new FakeDevinClient();
  return new HttpDevinClient(config.DEVIN_API_KEY, config.DEVIN_ORG_ID);
}

export function makeGitHubClient(config: Config): GitHubClient {
  if (config.GITHUB_MOCK === '1' || !config.GITHUB_TOKEN) return new FakeGitHubClient();
  return new HttpGitHubClient(config.GITHUB_TOKEN);
}

export function makeBuilder(config: Config): Builder {
  if (config.GITHUB_MOCK === '1') return new FakeBuilder();
  return new RepoBuilder({ token: config.GITHUB_TOKEN ?? '', mode: config.BUILD_MODE });
}

export function createApp({ db, config, connector, devin, github, builder, bundles }: AppDependencies): express.Express {
  const app = express();
  const data = connector ?? new CsvConnector(db, path.resolve('data'));
  data.loadIfEmpty();
  const devinClient = devin ?? makeDevinClient(config);
  app.use(express.json({ limit: '1mb' }));
  app.use(createSessionMiddleware(config));
  registerAuthRoutes(app, db);
  registerAuditRoutes(app, db);
  registerDatasetRoutes(app, db, data);
  registerCatalogRoutes(app, db);
  registerAdminRoutes(app, db);
  registerRequestRoutes(app, db, data);
  registerRuntimeRoutes(app, db, data);
  const gh = github ?? makeGitHubClient(config);
  registerApprovalRoutes(app, { db, connector: data, devin: devinClient, config, github: gh });
  registerPublishRoutes(app, { db, github: gh, builder: builder ?? makeBuilder(config), bundles: bundles ?? new BundleStore(path.resolve('var/bundles')) });
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
  const devin = makeDevinClient(config);
  const app = createApp({ db, config, devin });
  startPoller(db, devin, config.DEVIN_MOCK === '1' ? 3000 : 15000);

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

  const server = app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => {
    process.stdout.write(`Internal Tools Platform listening on http://localhost:${process.env.PORT ?? 3000}\n`);
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
