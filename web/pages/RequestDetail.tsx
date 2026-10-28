import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppFrame } from '../AppFrame.js';
import { api, type AppRequest, type Grant, type Me } from '../api.js';
import { Badge, Card, ErrorText, PermissionLabel } from '../components/ui.js';

export function RequestDetail({ me }: { me: Me }) {
  const { id } = useParams();
  const [r, setR] = useState<AppRequest | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => api<{ request: AppRequest }>(`/api/requests/${id}`).then((x) => { setR(x.request); setGrants(x.request.grants); }).catch((e: Error) => setError(e.message)), [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (r?.status !== 'building') return; const t = setInterval(() => void load(), 4000); return () => clearInterval(t); }, [r?.status, load]);
  if (!r) return <div className="page"><ErrorText error={error} /><p className="muted">Loading…</p></div>;
  const canReview = (me.role === 'approver' || me.role === 'admin') && r.requesterId !== me.id;
  const act = async (label: string, path: string, json?: unknown) => { setBusy(label); setError(''); try { await api(path, { method: 'POST', json: json ?? {} }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } };
  const requested = r.grants;

  return (
    <div className="page">
      <div className="page-head"><div><p className="eyebrow"><Link to="/requests">← Back</Link></p><h1>{r.name}</h1><p className="muted">Requested by {r.requesterName} · for {r.teams.join(', ')}</p></div><Badge status={r.status} /></div>
      <ErrorText error={error} />
      <Card title="What was asked for"><p className="prewrap">{r.description}</p></Card>

      <Card title="Data access">
        <ul className="grant-list">
          {(canReview && r.status === 'pending_review' ? grants : r.grants).map((g) => (
            <li key={g.dataset}><strong>{g.dataset}</strong>
              {canReview && r.status === 'pending_review' ? (
                <span className="toggle-row">
                  <label className={`chip ${g.permission === 'read' ? 'on' : ''}`}><input type="radio" checked={g.permission === 'read'} onChange={() => setGrants(grants.map((x) => x.dataset === g.dataset ? { ...x, permission: 'read' } : x))} />View</label>
                  {requested.find((x) => x.dataset === g.dataset)?.permission === 'write' && <label className={`chip ${g.permission === 'write' ? 'on' : ''}`}><input type="radio" checked={g.permission === 'write'} onChange={() => setGrants(grants.map((x) => x.dataset === g.dataset ? { ...x, permission: 'write' } : x))} />View and change</label>}
                  <button type="button" className="link-button" onClick={() => setGrants(grants.filter((x) => x.dataset !== g.dataset))}>Remove</button>
                </span>
              ) : <PermissionLabel permission={g.permission} />}
            </li>
          ))}
        </ul>
        {canReview && r.status === 'pending_review' && <p className="muted small">You can narrow access before approving, but not widen it.</p>}
      </Card>

      {r.status === 'pending_review' && canReview && (
        <Card title="Checkpoint 1 · Approve the request">
          <label className="field">Note for the requester (optional)<input value={comment} onChange={(e) => setComment(e.target.value)} /></label>
          <div className="actions"><button className="primary-button" disabled={!!busy} onClick={() => void act('approve', `/api/requests/${r.id}/approve`, { grants, comment })}>{busy === 'approve' ? 'Starting Devin…' : 'Approve and start building'}</button><button className="secondary-button" disabled={!!busy} onClick={() => void act('reject', `/api/requests/${r.id}/reject`, { comment })}>Decline</button></div>
        </Card>
      )}
      {r.status === 'pending_review' && !canReview && <Card><p>An approver will review this request. You will see progress here.</p></Card>}
      {r.status === 'rejected' && <Card title="Not approved"><p>{r.gate1Comment || 'The approver declined this request.'}</p></Card>}

      {r.status === 'building' && (
        <Card title="Devin is building your app">
          <p className="muted">This usually takes a few minutes. The page refreshes on its own.</p>
          {r.devinStatusDetail === 'waiting_for_user' && <p className="error-message">Devin is waiting for input. An engineer should check the session.</p>}
          {canReview && <p className="small muted">Technical details: status {r.devinStatus}/{r.devinStatusDetail ?? '—'}{r.devinUrl && <> · <a href={r.devinUrl} target="_blank" rel="noreferrer">Open Devin session</a></>}{r.prUrl && <> · <a href={r.prUrl} target="_blank" rel="noreferrer">Pull request</a></>}</p>}
        </Card>
      )}
      {r.status === 'build_failed' && (
        <Card title="The build needs attention"><p>{r.failureReason}</p>{canReview && <div className="actions"><button className="primary-button" disabled={!!busy} onClick={() => void act('retry', `/api/requests/${r.id}/retry`)}>Try again</button>{r.devinUrl && <a className="secondary-button" href={r.devinUrl} target="_blank" rel="noreferrer">Open Devin session</a>}</div>}</Card>
      )}

      {r.status === 'ready_for_review' && (
        <Card title={canReview ? 'Checkpoint 2 · Review and publish' : 'Built — waiting for final review'}>
          {canReview ? (
            <>
              <p className="small muted">Code review happens on GitHub: <a href={r.prUrl ?? '#'} target="_blank" rel="noreferrer">open the pull request</a>. Publishing requires the pull request to be merged; the app is then pinned to that exact version.</p>
              <div className="actions">
                <button className="secondary-button" disabled={!!busy} onClick={() => void act('preview', `/api/requests/${r.id}/preview`)}>{busy === 'preview' ? 'Building preview…' : r.previewSha ? 'Rebuild preview' : 'Build preview'}</button>
                <button className="primary-button" disabled={!!busy} onClick={() => void act('publish', `/api/requests/${r.id}/publish`)}>{busy === 'publish' ? 'Publishing…' : 'Publish to catalog'}</button>
              </div>
              {r.previewSha && (
                <div className="frame-wrap">
                  <div className="preview-banner">Preview — not live · v{r.previewSha.slice(0, 7)}</div>
                  <AppFrame slug={r.slug} mode="preview" requestId={r.id} src={`/apps/${r.slug}/preview/${r.id}/`} title={`Preview of ${r.name}`} />
                </div>
              )}
            </>
          ) : <p>An approver is reviewing the finished app. Once it is published you will find it under Apps.</p>}
        </Card>
      )}
      {r.status === 'live' && <Card title="Live"><p>This app is published. <Link to={`/apps/${r.slug}`}>Open it</Link>.</p></Card>}
      {r.status === 'unpublished' && <Card title="Taken offline"><p>An admin took this app offline.</p></Card>}
    </div>
  );
}
