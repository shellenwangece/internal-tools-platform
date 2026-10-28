import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db.js';
import { DataError, type DataConnector, type DatasetInfo, type QueryOpts, type Row, type Scalar } from './connector.js';
import { DATASETS } from './schemas.js';

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cur.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = ''; rows.push(cur); cur = [];
    } else field += ch;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

export class CsvConnector implements DataConnector {
  constructor(
    private db: Db,
    private dataDir: string,
    private datasets: DatasetInfo[] = DATASETS,
  ) {
    for (const ds of datasets) this.createTable(ds);
  }

  private table(ds: DatasetInfo) { return `ds_${ds.name}`; }

  private createTable(ds: DatasetInfo) {
    if (!IDENT.test(ds.name) || !ds.columns.every((c) => IDENT.test(c.name))) throw new Error(`bad identifier in dataset ${ds.name}`);
    const cols = ds.columns.map((c) => `"${c.name}" ${c.type === 'number' ? 'REAL' : c.type === 'boolean' ? 'INTEGER' : 'TEXT'}${c.name === ds.primaryKey ? ' PRIMARY KEY' : ''}`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${this.table(ds)} (${cols.join(', ')})`);
  }

  loadIfEmpty(): void {
    for (const ds of this.datasets) {
      const n = (this.db.prepare(`SELECT COUNT(*) AS n FROM ${this.table(ds)}`).get() as { n: number }).n;
      if (n === 0) this.loadDataset(ds);
    }
  }

  reset(): void {
    for (const ds of this.datasets) {
      this.db.exec(`DELETE FROM ${this.table(ds)}`);
      this.loadDataset(ds);
    }
  }

  private loadDataset(ds: DatasetInfo) {
    const file = path.join(this.dataDir, `${ds.name}.csv`);
    if (!fs.existsSync(file)) return;
    const raw = parseCsv(fs.readFileSync(file, 'utf8'));
    const names = ds.columns.map((c) => c.name);
    const stmt = this.db.prepare(`INSERT INTO ${this.table(ds)} (${names.map((c) => `"${c}"`).join(',')}) VALUES (${names.map(() => '?').join(',')})`);
    const tx = this.db.transaction((rows: Record<string, string>[]) => {
      for (const r of rows) stmt.run(names.map((c) => this.coerce(ds, c, r[c] ?? '')));
    });
    tx(raw);
  }

  private coerce(ds: DatasetInfo, col: string, v: Scalar | undefined): Scalar {
    const type = ds.columns.find((c) => c.name === col)!.type;
    if (v === null || v === undefined || v === '') return type === 'string' || type === 'datetime' ? '' : null;
    if (type === 'number') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isNaN(n)) throw new DataError('invalid', `${col} must be a number`);
      return n;
    }
    if (type === 'boolean') return v === true || v === 'true' || v === 1 || v === '1' ? 1 : 0;
    return String(v);
  }

  private fromDb(ds: DatasetInfo, row: Record<string, unknown>): Row {
    const out: Row = {};
    for (const c of ds.columns) {
      const v = row[c.name];
      out[c.name] = c.type === 'boolean' ? v === 1 : ((v ?? null) as Scalar);
    }
    return out;
  }

  listDatasets(): DatasetInfo[] { return this.datasets; }

  getSchema(name: string): DatasetInfo {
    const ds = this.datasets.find((d) => d.name === name);
    if (!ds) throw new DataError('not_found', `Unknown dataset "${name}"`);
    return ds;
  }

  private checkColumn(ds: DatasetInfo, col: string) {
    if (!ds.columns.some((c) => c.name === col)) throw new DataError('invalid', `Unknown column "${col}" in ${ds.name}`);
  }

  sample(name: string, n: number): Row[] {
    return this.query(name, { limit: n }).rows;
  }

  query(name: string, opts: QueryOpts): { rows: Row[]; total: number } {
    const ds = this.getSchema(name);
    const where: string[] = [];
    const params: Scalar[] = [];
    for (const [col, val] of Object.entries(opts.filter ?? {})) {
      this.checkColumn(ds, col);
      where.push(`"${col}" = ?`);
      params.push(this.coerce(ds, col, val));
    }
    if (opts.search) {
      const strCols = ds.columns.filter((c) => c.type === 'string').map((c) => `"${c.name}" LIKE ? COLLATE NOCASE`);
      where.push(`(${strCols.join(' OR ')})`);
      for (let i = 0; i < strCols.length; i++) params.push(`%${opts.search}%`);
    }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    let orderSql = ` ORDER BY "${ds.primaryKey}" ASC`;
    if (opts.sort) {
      this.checkColumn(ds, opts.sort.field);
      orderSql = ` ORDER BY "${opts.sort.field}" ${opts.sort.dir === 'desc' ? 'DESC' : 'ASC'}`;
    }
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM ${this.table(ds)}${whereSql}`).get(...params) as { n: number }).n;
    const rows = this.db.prepare(`SELECT * FROM ${this.table(ds)}${whereSql}${orderSql} LIMIT ? OFFSET ?`).all(...params, limit, offset) as Record<string, unknown>[];
    return { rows: rows.map((r) => this.fromDb(ds, r)), total };
  }

  private getById(ds: DatasetInfo, id: string): Row {
    const row = this.db.prepare(`SELECT * FROM ${this.table(ds)} WHERE "${ds.primaryKey}" = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) throw new DataError('not_found', `No ${ds.name} row with ${ds.primaryKey} "${id}"`);
    return this.fromDb(ds, row);
  }

  update(name: string, id: string, patch: Row, actorId: string): { before: Row; after: Row } {
    const ds = this.getSchema(name);
    const before = this.getById(ds, id);
    const cols = Object.keys(patch);
    if (cols.length === 0) throw new DataError('invalid', 'Nothing to change');
    for (const col of cols) {
      this.checkColumn(ds, col);
      if (col === ds.primaryKey) throw new DataError('invalid', `The ${ds.primaryKey} of a row cannot be changed`);
    }
    const values: Record<string, Scalar> = {};
    for (const col of cols) values[col] = this.coerce(ds, col, patch[col]);
    if (ds.columns.some((c) => c.name === 'updated_at')) values.updated_at = new Date().toISOString();
    if (ds.columns.some((c) => c.name === 'updated_by')) values.updated_by = actorId;
    const set = Object.keys(values).map((c) => `"${c}" = ?`).join(', ');
    this.db.prepare(`UPDATE ${this.table(ds)} SET ${set} WHERE "${ds.primaryKey}" = ?`).run(...Object.values(values), id);
    return { before, after: this.getById(ds, id) };
  }

  insert(name: string, row: Row, actorId: string): Row {
    const ds = this.getSchema(name);
    for (const col of Object.keys(row)) this.checkColumn(ds, col);
    const id = row[ds.primaryKey];
    if (id === undefined || id === null || id === '') throw new DataError('invalid', `${ds.primaryKey} is required`);
    const values: Record<string, Scalar> = {};
    for (const c of ds.columns) values[c.name] = this.coerce(ds, c.name, row[c.name]);
    if (ds.columns.some((c) => c.name === 'updated_at')) values.updated_at = new Date().toISOString();
    if (ds.columns.some((c) => c.name === 'updated_by')) values.updated_by = actorId;
    const names = Object.keys(values);
    try {
      this.db.prepare(`INSERT INTO ${this.table(ds)} (${names.map((c) => `"${c}"`).join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...Object.values(values));
    } catch (e) {
      if (String(e).includes('UNIQUE') || String(e).includes('PRIMARY')) throw new DataError('invalid', `${ds.primaryKey} "${id}" already exists`);
      throw e;
    }
    return this.getById(ds, String(id));
  }
}
