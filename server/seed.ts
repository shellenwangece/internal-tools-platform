import type { Db } from './db.js';

const users = [
  { id: 'priya', name: 'Priya Shah', role: 'requester', team: 'Compliance' },
  { id: 'marco', name: 'Marco Rossi', role: 'approver', team: 'Engineering' },
  { id: 'ava', name: 'Ava Chen', role: 'admin', team: 'Engineering' },
  { id: 'sam', name: 'Sam Okafor', role: 'app_user', team: 'Support' },
  { id: 'lena', name: 'Lena Park', role: 'app_user', team: 'Risk' },
] as const;

export function seedDemo(db: Db): void {
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, name, role, team) VALUES (@id, @name, @role, @team)',
  );

  const transaction = db.transaction(() => {
    for (const user of users) insertUser.run(user);
  });

  transaction();
}
