import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppFrame } from '../AppFrame.js';
import { api, type CatalogApp } from '../api.js';
import { ErrorText } from '../components/ui.js';

export function AppView() {
  const { slug = '' } = useParams();
  const [app, setApp] = useState<CatalogApp | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<{ app: CatalogApp }>(`/api/apps/${slug}`).then((r) => setApp(r.app)).catch((e: Error) => setError(e.message)); }, [slug]);
  if (error) return <div className="page"><ErrorText error={error} /><Link to="/catalog">Back to apps</Link></div>;
  if (!app) return <div className="page"><p className="muted">Loading…</p></div>;
  return (
    <div className="page app-page">
      <div className="app-bar"><Link to="/catalog">← Apps</Link><strong>{app.name}</strong><span className="muted small">Built by Devin · v{(app.liveSha ?? '').slice(0, 7)} · data access: {app.grants.map((g) => `${g.dataset} (${g.permission === 'write' ? 'view and change' : 'view'})`).join(', ')}</span></div>
      <div className="frame-wrap tall"><AppFrame slug={app.slug} mode="live" src={`/apps/${app.slug}/live/`} title={app.name} /></div>
    </div>
  );
}
