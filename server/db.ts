import Database from 'better-sqlite3';

export type Db = Database.Database;

export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('requester', 'approver', 'admin', 'app_user')),
      team TEXT NOT NULL CHECK (team IN ('Compliance', 'Support', 'Risk', 'Engineering'))
    );

    CREATE TABLE IF NOT EXISTS apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('external', 'built')),
      url TEXT,
      owner TEXT NOT NULL DEFAULT '',
      teams_json TEXT NOT NULL DEFAULT '[]',
      repo TEXT,
      live_sha TEXT,
      status TEXT NOT NULL DEFAULT 'external',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id INTEGER REFERENCES apps(id),
      requester_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      teams_json TEXT NOT NULL,
      grants_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending_review', 'rejected', 'building', 'build_failed', 'ready_for_review', 'live', 'unpublished')),
      gate1_by TEXT REFERENCES users(id),
      gate1_at TEXT,
      gate1_comment TEXT,
      gate2_by TEXT REFERENCES users(id),
      gate2_at TEXT,
      devin_session_id TEXT,
      devin_url TEXT,
      devin_status TEXT,
      devin_status_detail TEXT,
      pr_url TEXT,
      repo_url TEXT,
      preview_sha TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      actor_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    );
  `);
  return db;
}
