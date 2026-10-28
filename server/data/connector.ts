export type Scalar = string | number | boolean | null;
export type Row = Record<string, Scalar>;
export type ColumnType = 'string' | 'number' | 'boolean' | 'datetime';

export interface DatasetInfo {
  name: string;
  label: string;
  description: string;
  primaryKey: string;
  columns: { name: string; type: ColumnType }[];
}

export interface QueryOpts {
  filter?: Record<string, string | number | boolean>;
  search?: string;
  sort?: { field: string; dir: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

export class DataError extends Error {
  constructor(
    public code: 'not_found' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

export interface DataConnector {
  listDatasets(): DatasetInfo[];
  getSchema(name: string): DatasetInfo;
  sample(name: string, n: number): Row[];
  query(name: string, opts: QueryOpts): { rows: Row[]; total: number };
  update(name: string, id: string, patch: Row, actorId: string): { before: Row; after: Row };
  insert(name: string, row: Row, actorId: string): Row;
}
