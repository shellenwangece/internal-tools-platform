import type { ReactNode } from 'react';

export function Page({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold text-slate-900">{title}</h1>{description && <p className="text-slate-500 mt-1">{description}</p>}</div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

export function Stat({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const tones = { default: 'text-slate-900', good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700' };
  return <Card><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</div></Card>;
}

export function Badge({ children, tone = 'grey' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'grey' | 'indigo' }) {
  const tones = { green: 'bg-emerald-100 text-emerald-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800', grey: 'bg-slate-100 text-slate-700', indigo: 'bg-indigo-100 text-indigo-800' };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function statusTone(status: unknown): 'green' | 'amber' | 'red' | 'grey' {
  const s = String(status ?? '').toLowerCase();
  if (['approved', 'resolved', 'enabled', 'paid', 'true', 'active'].includes(s)) return 'green';
  if (['pending', 'in_review', 'requested', 'escalated'].includes(s)) return 'amber';
  if (['rejected', 'denied', 'failed', 'disabled', 'false'].includes(s)) return 'red';
  return 'grey';
}

export function Button({ children, variant = 'primary', ...rest }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = { primary: 'bg-indigo-600 text-white hover:bg-indigo-700', secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50', danger: 'bg-red-600 text-white hover:bg-red-700' };
  return <button {...rest} className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles[variant]} ${rest.className ?? ''}`}>{children}</button>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm ${props.className ?? ''}`} />;
}

export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode; sortable?: boolean; align?: 'left' | 'right' }

export function Table<T extends Record<string, unknown>>({ columns, rows, rowKey, sort, onSort, onRowClick, emptyText = 'Nothing to show yet.' }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; sort?: { field: string; dir: 'asc' | 'desc' }; onSort?: (field: string) => void; onRowClick?: (row: T) => void; emptyText?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>{columns.map((c) => <th key={c.key} className={`px-3 py-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.sortable && onSort ? <button className="hover:text-slate-900" onClick={() => onSort(c.key)}>{c.header}{sort?.field === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button> : c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">{emptyText}</td></tr>}
          {rows.map((r) => <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`border-t border-slate-100 ${onRowClick ? 'cursor-pointer hover:bg-indigo-50/40' : ''}`}>{columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  return <div className="flex items-center justify-between text-sm text-slate-600"><span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span><div className="flex gap-2"><Button variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</Button><Button variant="secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Next</Button></div></div>;
}

export const money = (amount: unknown, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount ?? 0));
export const when = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString() : '—');
