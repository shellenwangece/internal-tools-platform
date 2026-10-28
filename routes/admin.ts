import type { Express } from 'express';
import { z } from 'zod';
import { appendAudit } from '../server/audit.js';
import { requireRole, requireUser } from '../server/auth.js';
import type { Db } from '../server/db.js';

export function registerAdminRoutes(app: Express, db: Db): void {
  app.get('/api/admin/users', requireUser(db), requireRole('admin'), (_req, res) => {
    res.json({ users: db.prepare('SELECT id, name, role, team FROM users ORDER BY name').all() });
  });
  app.post('/api/admin/users/:id/role', requireUser(db), requireRole('admin'), (req, res) => {
    const parsed = z.object({ role: z.enum(['requester', 'approver', 'admin', 'app_user']) }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Choose a valid role' }); return; }
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id) as { id: string; role: string } | undefined;
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    if (user.id === req.user!.id) { res.status(400).json({ error: 'You cannot change your own role' }); return; }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(parsed.data.role, user.id);
    appendAudit(db, { actorId: req.user!.id, action: 'user.role_changed', target: `user:${user.id}`, details: { from: user.role, to: parsed.data.role } });
    res.json({ ok: true });
  });
}
