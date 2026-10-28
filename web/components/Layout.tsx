import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Me } from '../api.js';

export function Layout({ me }: { me: Me }) {
  const nav = useNavigate();
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); nav('/'); window.location.reload(); }
  const canReview = me.role === 'approver' || me.role === 'admin';
  const canRequest = me.role !== 'app_user';
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark small">IT</span> Internal Tools Platform</div>
        <nav className="nav">
          <NavLink to="/catalog">Apps</NavLink>
          {canRequest && <NavLink to="/requests/new">Request an app</NavLink>}
          <NavLink to="/requests">{canReview ? 'Approvals' : 'My requests'}</NavLink>
          {me.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          {me.role === 'admin' && <NavLink to="/audit">Audit log</NavLink>}
        </nav>
        <div className="whoami">
          <span className="avatar">{me.name.split(' ').map((n) => n[0]).join('')}</span>
          <span className="user-copy"><span className="user-name">{me.name}</span><span className="user-details">{me.role.replace('_', ' ')} · {me.team}</span></span>
          <button className="secondary-button" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>
      <main className="content"><Outlet /></main>
    </div>
  );
}
