import { useEffect, useState } from 'react';
import { AuditLog } from './pages/AuditLog.js';

interface DemoUser {
  id: string;
  name: string;
  role: string;
  team: string;
}

export function App() {
  if (window.location.pathname === '/audit') return <AuditLog />;

  const [users, setUsers] = useState<DemoUser[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/users')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load demo users.');
        setUsers((await response.json()) as DemoUser[]);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Something went wrong.'))
      .finally(() => setLoading(false));
  }, []);

  async function login(userId: string) {
    setError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (response.ok) {
      window.location.assign(userId === 'ava' ? '/audit' : '/catalog');
      return;
    }
    const result = (await response.json()) as { error?: string };
    setError(result.error ?? 'Could not log in. Please try again.');
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark" aria-hidden="true">IT</div>
        <p className="eyebrow">Internal Tools Platform</p>
        <h1>Welcome back</h1>
        <p className="muted">Choose a demo user to continue.</p>
        {error && <p className="error-message" role="alert">{error}</p>}
        {loading ? (
          <p className="muted">Loading demo users…</p>
        ) : (
          <div className="user-list" aria-label="Demo users">
            {users.map((user) => (
              <button className="user-option" key={user.id} onClick={() => void login(user.id)}>
                <span className="avatar">{user.name.split(' ').map((name) => name[0]).join('')}</span>
                <span className="user-copy">
                  <span className="user-name">{user.name}</span>
                  <span className="user-details">{user.role.replace('_', ' ')} · {user.team}</span>
                </span>
                <span className="arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        )}
        <p className="login-note">Demo sign-in · No password required</p>
      </section>
    </main>
  );
}
