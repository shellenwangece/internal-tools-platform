import { createBridgeTransport } from './bridge';
import { createMockTransport } from './mock';
import type { Context, DatasetInfo, QueryOpts, Row, Transport } from './types';

export { PlatformError } from './types';
export type { Context, DatasetInfo, QueryOpts, Row } from './types';

/** Inside the platform the app is framed; alone (npm run dev) it runs against mock data. */
export function createPlatform(transport: Transport) {
  return {
    getContext: () => transport.call<Context>('getContext'),
    datasets: {
      list: () => transport.call<DatasetInfo[]>('datasets.list'),
      query: (name: string, opts: QueryOpts = {}) => transport.call<{ rows: Row[]; total: number }>('datasets.query', { name, opts }),
      update: (name: string, id: string, patch: Row) => transport.call<Row>('datasets.update', { name, id, patch }),
      insert: (name: string, row: Row) => transport.call<Row>('datasets.insert', { name, row }),
    },
  };
}

const framed = typeof window !== 'undefined' && window.parent !== window;
export const platform = createPlatform(framed ? createBridgeTransport() : createMockTransport());
export type Platform = ReturnType<typeof createPlatform>;
