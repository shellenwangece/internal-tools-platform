import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from '../server/data/csvConnector.js';
import { DATASETS } from '../server/data/schemas.js';

const out = path.resolve('template/mock');
fs.mkdirSync(out, { recursive: true });
for (const ds of DATASETS) {
  const rows = parseCsv(fs.readFileSync(path.resolve('data', `${ds.name}.csv`), 'utf8')).slice(0, 40).map((r) => {
    const o: Record<string, string | number | boolean | null> = {};
    for (const c of ds.columns) { const v = r[c.name] ?? ''; o[c.name] = c.type === 'number' ? (v === '' ? null : Number(v)) : c.type === 'boolean' ? v === 'true' : v; }
    return o;
  });
  fs.writeFileSync(path.join(out, `${ds.name}.json`), JSON.stringify(rows, null, 1) + '\n');
}
fs.writeFileSync(path.join(out, 'schemas.json'), JSON.stringify(DATASETS, null, 1) + '\n');
if (!fs.existsSync(path.join(out, 'grants.json'))) fs.writeFileSync(path.join(out, 'grants.json'), JSON.stringify([{ dataset: 'kyc_cases', permission: 'write' }, { dataset: 'customers', permission: 'read' }], null, 1) + '\n');
process.stdout.write('template/mock synced\n');
