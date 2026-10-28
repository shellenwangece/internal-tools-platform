import type { Db } from './db.js';

const users = [
  { id: 'priya', name: 'Priya Shah', role: 'requester', team: 'Compliance' },
  { id: 'marco', name: 'Marco Rossi', role: 'approver', team: 'Engineering' },
  { id: 'ava', name: 'Ava Chen', role: 'admin', team: 'Engineering' },
  { id: 'sam', name: 'Sam Okafor', role: 'app_user', team: 'Support' },
  { id: 'lena', name: 'Lena Park', role: 'app_user', team: 'Risk' },
] as const;

const externalApps = [
  {
    slug: 'legacy-kyc-review-queue',
    name: 'KYC Review Queue',
    description: 'Review pending customer identity cases.',
    teams: ['Compliance'],
  },
  {
    slug: 'legacy-refunds-dashboard',
    name: 'Refunds Dashboard',
    description: 'Review and track customer refunds.',
    teams: ['Support', 'Risk'],
  },
  {
    slug: 'legacy-feature-flag-admin',
    name: 'Feature Flag Admin',
    description: 'Manage feature rollout settings.',
    teams: ['Engineering'],
  },
] as const;

export function seedDemo(db: Db): void {
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, name, role, team) VALUES (@id, @name, @role, @team)',
  );
  const insertApp = db.prepare(`
    INSERT OR IGNORE INTO apps
      (slug, name, description, kind, url, owner, teams_json, status)
    VALUES
      (@slug, @name, @description, 'external', @url, 'Power Apps (legacy)', @teams, 'external')
  `);

  const transaction = db.transaction(() => {
    for (const user of users) insertUser.run(user);
    for (const app of externalApps) {
      insertApp.run({
        ...app,
        url: `https://apps.powerapps.com/play/${app.slug}`,
        teams: JSON.stringify(app.teams),
      });
    }
  });

  transaction();
}
