import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type AppRequest, type Me } from '../api.js';
import { Badge, ErrorText, PermissionLabel } from '../components/ui.js';

export function Requests({ me }: { me: Me }) {
  const [requests, setRequests] = useState<AppRequest[]>([]);
  const [error, setError] = useState('');
  const canReview = me.role === 'approver' || me.role === 'admin';
  useEffect(() => { api<{ requests: AppRequest[] }>('/api/requests').then((r) => setRequests(r.requests)).catch((e: Error) => setError(e.message)); }, []);
  return (
    <div className="page">
      <div className="page-head"><div><h1>{canReview ? 'Approvals' : 'My requests'}</h1><p className="muted">{canReview ? 'Requests waiting for your review, builds in progress, and apps ready to publish.' : 'Apps you have asked for and where they are.'}</p></div></div>
      <ErrorText error={error} />
      {requests.length === 0 && <p className="muted">Nothing here yet.</p>}
      <div className="list">
        {requests.map((r) => (
          <Link key={r.id} to={`/requests/${r.id}`} className="list-row">
            <div><strong>{r.name}</strong><div className="muted small">{canReview ? `Requested by ${r.requesterName} · ` : ''}for {r.teams.join(', ')} · {r.grants.map((g) => g.dataset).join(', ')}</div></div>
            <div className="row-right"><Badge status={r.status} />{r.status === 'building' && r.devinStatusDetail === 'waiting_for_user' && <span className="badge badge-red">Needs attention</span>}</div>
          </Link>
        ))}
      </div>
      {!canReview && <p className="muted small">Permissions: <PermissionLabel permission="read" /> means the app can only show data; <PermissionLabel permission="write" /> means it can also update it.</p>}
    </div>
  );
}
