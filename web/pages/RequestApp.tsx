import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Dataset, type Grant } from '../api.js';
import { ErrorText } from '../components/ui.js';

const TEAMS = ['Compliance', 'Support', 'Risk', 'Engineering'];

export function RequestApp() {
  const nav = useNavigate();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teams, setTeams] = useState<string[]>([]);
  const [grants, setGrants] = useState<Record<string, 'read' | 'write' | undefined>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ datasets: Dataset[] }>('/api/datasets').then((r) => setDatasets(r.datasets)).catch((e: Error) => setError(e.message)); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const g: Grant[] = Object.entries(grants).filter(([, p]) => p).map(([dataset, permission]) => ({ dataset, permission: permission! }));
    try {
      const r = await api<{ request: { id: number } }>('/api/requests', { method: 'POST', json: { name, description, teams, grants: g } });
      nav(`/requests/${r.request.id}`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <form className="page narrow" onSubmit={(e) => void submit(e)}>
      <h1>Request a new app</h1>
      <p className="muted">Describe what you need in plain language. An approver will review it, then Devin builds it.</p>
      <ErrorText error={error} />
      <label className="field">App name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Refunds Dashboard" required minLength={3} maxLength={60} /></label>
      <label className="field">What should the app do?<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={7} required minLength={20} placeholder="Who uses it, what they need to see, and what actions they take. Example: Support agents need to see pending refunds with the customer name and amount, filter by reason, and approve or deny each one." /></label>
      <fieldset className="field"><legend>Who will use it?</legend>
        <div className="chips">{TEAMS.map((t) => <label key={t} className={`chip ${teams.includes(t) ? 'on' : ''}`}><input type="checkbox" checked={teams.includes(t)} onChange={(e) => setTeams(e.target.checked ? [...teams, t] : teams.filter((x) => x !== t))} />{t}</label>)}</div>
      </fieldset>
      <fieldset className="field"><legend>Which data does it need?</legend>
        <div className="dataset-list">
          {datasets.map((d) => (
            <div key={d.name} className={`dataset-card ${grants[d.name] ? 'on' : ''}`}>
              <div className="dataset-head"><strong>{d.label}</strong><span className="muted">{d.rowCount} rows</span></div>
              <p className="muted small">{d.description}</p>
              <p className="muted small">Columns: {d.columns.map((c) => c.name).join(', ')}</p>
              <div className="toggle-row">
                {(['read', 'write'] as const).map((p) => <label key={p} className={`chip ${grants[d.name] === p ? 'on' : ''}`}><input type="radio" name={`g-${d.name}`} checked={grants[d.name] === p} onChange={() => setGrants({ ...grants, [d.name]: p })} />{p === 'read' ? 'View' : 'View and change'}</label>)}
                {grants[d.name] && <button type="button" className="link-button" onClick={() => setGrants({ ...grants, [d.name]: undefined })}>Not needed</button>}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="actions"><button className="primary-button" disabled={busy}>{busy ? 'Sending…' : 'Send for approval'}</button></div>
    </form>
  );
}
