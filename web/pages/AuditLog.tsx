import { useCallback, useEffect, useState } from 'react';

interface AuditEntry {
  id: number;
  ts: string;
  actor: string | null;
  actorId: string | null;
  action: string;
  target: string;
  details: Record<string, unknown>;
  hash: string;
}

interface IntegrityResult {
  ok: boolean;
  brokenAtId?: number;
}

export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [target, setTarget] = useState('');
  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [error, setError] = useState('');

  const loadEntries = useCallback(async () => {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (actor) params.set('actor', actor);
    if (target) params.set('target', target);
    const response = await fetch(`/api/audit?${params}`);
    if (!response.ok) {
      setError(response.status === 403 ? 'Only admins can view the full audit log.' : 'Could not load the audit log.');
      return;
    }
    setError('');
    setEntries((await response.json()) as AuditEntry[]);
  }, [action, actor, target]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  async function verifyIntegrity() {
    const response = await fetch('/api/audit/verify');
    if (!response.ok) {
      setError('Could not verify the audit log.');
      return;
    }
    setIntegrity((await response.json()) as IntegrityResult);
  }

  return (
    <main className="audit-page">
      <header className="audit-header">
        <div>
          <p className="eyebrow">Internal Tools Platform</p>
          <h1>Audit log</h1>
          <p className="muted">A complete history of platform activity.</p>
        </div>
        <nav className="audit-actions" aria-label="Audit actions">
          <a className="secondary-button" href="/catalog">App catalog</a>
          <a className="secondary-button" href="/api/audit/export.csv">Export CSV</a>
          <button className="primary-button" onClick={() => void verifyIntegrity()}>Verify integrity</button>
        </nav>
      </header>

      {integrity && (
        <p className={integrity.ok ? 'success-banner' : 'error-banner'} role="status">
          {integrity.ok ? 'Integrity check passed.' : `Integrity check failed at entry ${integrity.brokenAtId}.`}
        </p>
      )}
      {error && <p className="error-banner" role="alert">{error}</p>}

      <section className="audit-card">
        <form className="audit-filters" onSubmit={(event) => { event.preventDefault(); void loadEntries(); }}>
          <label>
            Action
            <input value={action} onChange={(event) => setAction(event.target.value)} placeholder="e.g. auth.login" />
          </label>
          <label>
            Person
            <input value={actor} onChange={(event) => setActor(event.target.value)} placeholder="Name or user ID" />
          </label>
          <label>
            Item
            <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="App or request" />
          </label>
          <button className="secondary-button" type="submit">Apply filters</button>
        </form>
        <div className="table-scroll">
          <table className="audit-table">
            <thead>
              <tr><th>When</th><th>Person</th><th>Action</th><th>Item</th><th>Details</th></tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.ts).toLocaleString()}</td>
                  <td>{entry.actor ?? 'Platform'}</td>
                  <td><span className="action-pill">{entry.action}</span></td>
                  <td>{entry.target}</td>
                  <td className="details-cell">{JSON.stringify(entry.details)}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={5} className="empty-cell">No matching activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
