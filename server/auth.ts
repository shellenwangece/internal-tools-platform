import cookieSession from 'cookie-session';
import type { RequestHandler } from 'express';
import type { Config } from './config.js';
import type { Db } from './db.js';

export type Role = 'requester' | 'approver' | 'admin' | 'app_user';
export type Team = 'Compliance' | 'Support' | 'Risk' | 'Engineering';

export interface User {
  id: string;
  name: string;
  role: Role;
  team: Team;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function createSessionMiddleware(config: Config): RequestHandler {
  return cookieSession({
    name: 'itp_session',
    keys: [config.SESSION_SECRET],
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  });
}

export function requireUser(db: Db): RequestHandler {
  return (req, res, next) => {
    const userId = req.session?.userId;
    if (typeof userId !== 'string') {
      res.sendStatus(401);
      return;
    }

    const user = db
      .prepare('SELECT id, name, role, team FROM users WHERE id = ?')
      .get(userId) as User | undefined;
    if (!user) {
      req.session = null;
      res.sendStatus(401);
      return;
    }

    req.user = user;
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.sendStatus(401);
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.sendStatus(403);
      return;
    }
    next();
  };
}
