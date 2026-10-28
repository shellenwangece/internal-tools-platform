import { useCallback, useEffect, useState } from 'react';
import { api, type CatalogApp, type Dataset, type Me } from '../api.js';
import { Badge, Card, ErrorText } from '../components/ui.js';

export function Admin({ me }: { me: Me }) {
  const [users, setUsers] = useState<Me[]>([]);
  const [apps, setApps] = useState<CatalogApp[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [ext, setExt] = useState({ name: '', url: '', owner: '', teams: ['Engineering'] as string[], description: '' });
  const load = useCallback(async () => {
    try {
      const [u, a, d] = await Promise.all([api<{ users: Me[] }>('/api/admin/users'), api<{ apps: CatalogApp[] }>('/api/apps'), api<{ datasets: Dataset[] }>('/api/datasets')]);
      setUsers(u.users); setApps(a.apps); setDatasets(d.datasets);
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const run = async (path: string, json: unknown, msg: string) => { setError(''); setOk(''); try { await api(path, { method: 'POST', json }); setOk(msg); await load(); } catch (e) { setError((e as Error).message); } };
  return (
    <div className="page">
      <h1>Admin</h1>
      <ErrorText error={error} />{ok && <p className="success-banner">{ok}</p>}
      <Card title="People and roles">
        <table className="audit-table"><thead><tr><th>Name</th><th>Team</th><th>Role</th></tr></thead><tbody>
          {users.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.team}</td><td><select value={u.role} disabled={u.id === me.id} onChange={(e) => void run(`/api/admin/users/${u.id}/role`, { role: e.target.value }, `${u.name} is now ${e.target.value.replace('_', ' ')}`)}>{['requester', 'approver', 'admin', 'app_user'].map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select></td></tr>)}
        </tbody></table>
      </Card>
      <Card title="Devin-built apps">
        {apps.filter((a) => a.kind === 'built').length === 0 && <p className="muted">None yet.</p>}
        <ul className="grant-list">{apps.filter((a) => a.kind === 'built').map((a) => <li key={a.slug}><span><strong>{a.name}</strong> <Badge status={a.status} /> <span className="muted small">v{(a.liveSha ?? '').slice(0, 7)} · {a.repo}</span></span>{a.status === 'live' && <button className="secondary-button" onClick={() => void run(`/api/admin/apps/${a.slug}/unpublish`, { reason: 'Taken offline by admin' }, `${a.name} is offline`)}>Take offline</button>}</li>)}</ul>
      </Card>
      <Card title="Register an existing app" >
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); void run('/api/admin/apps/external', ext, `${ext.name} added to the catalog`); }}>
          <input placeholder="Name" required value={ext.name} onChange={(e) => setExt({ ...ext, name: e.target.value })} />
          <input placeholder="https://…" required type="url" value={ext.url} onChange={(e) => setExt({ ...ext, url: e.target.value })} />
          <input placeholder="Owner (e.g. Finance)" required value={ext.owner} onChange={(e) => setExt({ ...ext, owner: e.target.value })} />
          <select multiple value={ext.teams} onChange={(e) => setExt({ ...ext, teams: [...e.target.selectedOptions].map((o) => o.value) })}>{['Compliance', 'Support', 'Risk', 'Engineering'].map((t) => <option key={t}>{t}</option>)}</select>
          <button className="primary-button">Add</button>
        </form>
      </Card>
      <Card title="Demo data" actions={<button className="secondary-button" onClick={() => void run('/api/admin/datasets/reset', {}, 'Demo data reset')}>Reset demo data</button>}>
        <ul className="grant-list">{datasets.map((d) => <li key={d.name}><span><strong>{d.label}</strong> <span className="muted small">{d.rowCount} rows · {d.columns.length} columns</span></span></li>)}</ul>
      </Card>
    </div>
  );
}
