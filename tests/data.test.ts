import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataError } from '../server/data/connector.js';
import { CsvConnector } from '../server/data/csvConnector.js';
import { openDb } from '../server/db.js';

describe('CsvConnector', () => {
  let db: ReturnType<typeof openDb>;
  let c: CsvConnector;
  beforeEach(() => {
    db = openDb(':memory:');
    c = new CsvConnector(db, path.resolve('data'));
    c.loadIfEmpty();
  });
  afterEach(() => db.close());

  it('loads all four datasets with the expected row counts', () => {
    expect(c.listDatasets().map((d) => d.name)).toEqual(['kyc_cases', 'refunds', 'customers', 'feature_flags']);
    expect(c.query('kyc_cases', {}).total).toBe(120);
    expect(c.query('refunds', {}).total).toBe(150);
    expect(c.query('customers', {}).total).toBe(80);
    expect(c.query('feature_flags', {}).total).toBe(25);
  });

  it('filters by column and pages results', () => {
    const { rows, total } = c.query('kyc_cases', { filter: { status: 'pending' }, limit: 10 });
    expect(rows.length).toBe(10);
    expect(total).toBeGreaterThan(10);
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
  });

  it('rejects unknown columns in filter and sort', () => {
    expect(() => c.query('kyc_cases', { filter: { 'status" OR 1=1 --': 'x' } })).toThrow(DataError);
    expect(() => c.query('kyc_cases', { sort: { field: 'nope', dir: 'asc' } })).toThrow(/Unknown column/);
  });

  it('searches across string columns', () => {
    const { rows } = c.query('refunds', { search: 'duplicate' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.reason === 'duplicate_charge')).toBe(true);
  });

  it('updates a row and stamps updated_at/updated_by', () => {
    const { before, after } = c.update('kyc_cases', 'KYC-2001', { status: 'approved' }, 'marco');
    expect(before.status).not.toBe(undefined);
    expect(after.status).toBe('approved');
    expect(after.updated_by).toBe('marco');
    expect(String(after.updated_at)).toMatch(/^\d{4}-/);
  });

  it('refuses to change the primary key', () => {
    expect(() => c.update('kyc_cases', 'KYC-2001', { case_id: 'X' }, 'marco')).toThrow(/cannot be changed/);
  });

  it('inserts a row and converts booleans', () => {
    const row = c.insert('feature_flags', { flag_key: 'test_flag', description: 'x', enabled: true, rollout_percent: 5, owner_team: 'Risk' }, 'ava');
    expect(row.enabled).toBe(true);
    expect(c.query('feature_flags', {}).total).toBe(26);
    expect(() => c.insert('feature_flags', { flag_key: 'test_flag' }, 'ava')).toThrow(/already exists/);
  });

  it('reset reloads the CSV data', () => {
    c.update('feature_flags', 'dark_mode', { enabled: false, rollout_percent: 0 }, 'ava');
    c.reset();
    expect(c.query('feature_flags', {}).total).toBe(25);
    expect(c.query('feature_flags', { filter: { flag_key: 'dark_mode' } }).rows[0].updated_by).not.toBe('ava');
  });
});
