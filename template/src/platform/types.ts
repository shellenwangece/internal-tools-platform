export type Scalar = string | number | boolean | null;
export type Row = Record<string, Scalar>;
export interface DatasetInfo {
  name: string;
  label: string;
  description: string;
  primaryKey: string;
  columns: { name: string; type: 'string' | 'number' | 'boolean' | 'datetime' }[];
  permission: 'read' | 'write';
}
export interface QueryOpts {
  filter?: Record<string, string | number | boolean>;
  search?: string;
  sort?: { field: string; dir: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}
export interface Context {
  user: { id: string; name: string; role: string; team: string };
  app: { slug: string; version: string; mode?: string };
}
export class PlatformError extends Error {
  constructor(public code: 'forbidden' | 'not_found' | 'invalid' | 'timeout', message: string) { super(message); this.name = 'PlatformError'; }
}
export interface Transport { call<T>(method: string, params?: unknown): Promise<T> }
