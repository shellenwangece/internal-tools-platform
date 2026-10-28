import { useEffect, useState } from 'react';
import { platform, PlatformError, type Context, type DatasetInfo } from './platform/sdk';
import { Badge, Card, Page } from './ui';

export default function App() {
  const [ctx, setCtx] = useState<Context | null>(null);
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([platform.getContext(), platform.datasets.list()])
      .then(([c, d]) => { setCtx(c); setDatasets(d); })
      .catch((e: unknown) => setError(e instanceof PlatformError ? e.message : 'Something went wrong'));
  }, []);
  return (
    <Page title="This app is ready to be built" description="Devin replaces this starter screen with the app described in the request.">
      {error && <Card className="border-red-200 text-red-700">{error}</Card>}
      {ctx && <Card><p>Signed in as <strong>{ctx.user.name}</strong> ({ctx.user.role.replace('_', ' ')}, {ctx.user.team}). App version {ctx.app.version}.</p></Card>}
      <Card>
        <h2 className="font-medium mb-2">Datasets this app may use</h2>
        {datasets.length === 0 ? <p className="text-slate-500">None granted yet.</p> : <ul className="space-y-1">{datasets.map((d) => <li key={d.name} className="flex items-center gap-2"><span>{d.label}</span><Badge tone={d.permission === 'write' ? 'amber' : 'indigo'}>{d.permission === 'write' ? 'View and change' : 'View'}</Badge></li>)}</ul>}
      </Card>
    </Page>
  );
}
