import { z } from 'zod';
import type { Express, Request, Response } from 'express';
import type { Db } from '../server/db.js';
import { appendAudit } from '../server/audit.js';
import { requireUser } from '../server/auth.js';

const loginSchema = z.object({ userId: z.string().min(1) });

export function registerAuthRoutes(app: Express, db: Db): void {
  app.get('/api/auth/users', (_req, res) => {
    const users = db
      .prepare('SELECT id, name, role, team FROM users ORDER BY name')
      .all();
    res.json(users);
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Choose a demo user to log in.' });
      return;
    }
    const user = db
      .prepare('SELECT id, name, role, team FROM users WHERE id = ?')
      .get(parsed.data.userId);
    if (!user) {
      res.status(400).json({ error: 'That demo user is not available.' });
      return;
    }
    req.session = { userId: parsed.data.userId };
    appendAudit(db, {
      actorId: parsed.data.userId,
      action: 'auth.login',
      target: `user:${parsed.data.userId}`,
    });
    res.json({ ok: true });
  });

  app.post('/api/auth/logout', requireUser(db), (req, res) => {
    appendAudit(db, {
      actorId: req.user!.id,
      action: 'auth.logout',
      target: `user:${req.user!.id}`,
    });
    req.session = null;
    res.sendStatus(204);
  });
}
