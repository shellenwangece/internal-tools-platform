import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CatalogApp, type Me } from '../api.js';
import { Badge, ErrorText } from '../components/ui.js';

export function Catalog({ me }: { me: Me }) {
  const [apps, setApps] = useState<CatalogApp[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api<{ apps: CatalogApp[] }>('/api/apps').then((r) => setApps(r.apps)).catch((e: Error) => setError(e.message)); }, []);
  const built = apps.filter((a) => a.kind === 'built');
  const external = apps.filter((a) => a.kind === 'external');
  return (
    <div className="page">
      <div className="page-head"><div><h1>Apps</h1><p className="muted">Internal tools available to the {me.team} team.</p></div>{me.role !== 'app_user' && <Link className="primary-button" to="/requests/new">Request an app</Link>}</div>
      <ErrorText error={error} />
      <h2 className="section-title">Built by Devin</h2>
      {built.length === 0 && <p className="muted">No Devin-built apps yet. Request one and it will appear here once approved.</p>}
      <div className="grid">
        {built.map((a) => (
          <Link key={a.slug} to={`/apps/${a.slug}`} className="app-card">
            <div className="app-card-head"><h3>{a.name}</h3><Badge status={a.status} /></div>
            <p className="muted">{a.description}</p>
            <p className="app-meta">Built by Devin{a.liveSha ? ` · v${a.liveSha.slice(0, 7)}` : ''} · for {a.teams.join(', ')}</p>
          </Link>
        ))}
      </div>
      {external.length > 0 && <>
      <h2 className="section-title">Other registered apps</h2>
      <div className="grid">
        {external.map((a) => (
          <a key={a.slug} href={a.url ?? '#'} target="_blank" rel="noreferrer" className="app-card external">
            <div className="app-card-head"><h3>{a.name}</h3><span className="badge badge-grey">{a.owner}</span></div>
            <p className="muted">{a.description}</p>
            <p className="app-meta">Opens in a new tab · for {a.teams.join(', ')}</p>
          </a>
        ))}
      </div>
      </>}
    </div>
  );
}
