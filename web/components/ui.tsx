import type { ReactNode } from 'react';
import { STATUS_LABEL } from '../api.js';

export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  const tone = ['live', 'approved'].includes(status) ? 'green' : ['rejected', 'build_failed', 'unpublished'].includes(status) ? 'red' : ['building', 'pending_review', 'ready_for_review'].includes(status) ? 'amber' : 'grey';
  return <span className={`badge badge-${tone}`}>{children ?? STATUS_LABEL[status] ?? status}</span>;
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="card">{(title || actions) && <div className="card-head"><h2>{title}</h2><div>{actions}</div></div>}{children}</section>;
}

export function PermissionLabel({ permission }: { permission: 'read' | 'write' }) {
  return <span className={`perm perm-${permission}`}>{permission === 'write' ? 'View and change' : 'View'}</span>;
}

export function ErrorText({ error }: { error: string }) { return error ? <p className="error-message" role="alert">{error}</p> : null; }
