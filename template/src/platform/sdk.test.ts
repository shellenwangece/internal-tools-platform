import { describe, expect, it, vi } from 'vitest';
import { createBridgeTransport } from './bridge';
import { createMockTransport } from './mock';
import { createPlatform } from './sdk';
import { PlatformError } from './types';

function fakeParent() {
  const posted: { type: string; id: string; method: string; params: unknown }[] = [];
  const target = { postMessage: (m: unknown) => posted.push(m as (typeof posted)[number]) } as unknown as Window;
  const reply = (id: string, body: object) => window.dispatchEvent(new MessageEvent('message', { data: { type: 'itp:response', id, ...body } }));
  return { posted, target, reply };
}

describe('platform SDK over the postMessage bridge', () => {
  it('sends a request and resolves the matching response', async () => {
    const { posted, target, reply } = fakeParent();
    const p = createPlatform(createBridgeTransport(target));
    const promise = p.datasets.query('refunds', { limit: 2 });
    expect(posted[0]).toMatchObject({ type: 'itp:request', method: 'datasets.query', params: { name: 'refunds', opts: { limit: 2 } } });
    reply('other-id', { ok: true, result: 'ignored' });
    reply(posted[0].id, { ok: true, result: { rows: [], total: 0 } });
    await expect(promise).resolves.toEqual({ rows: [], total: 0 });
  });

  it('rejects with PlatformError when the platform says no', async () => {
    const { posted, target, reply } = fakeParent();
    const p = createPlatform(createBridgeTransport(target));
    const promise = p.datasets.update('refunds', 'RF-1', { status: 'paid' });
    reply(posted[0].id, { ok: false, error: { code: 'forbidden', message: 'view only' } });
    await expect(promise).rejects.toMatchObject({ name: 'PlatformError', code: 'forbidden', message: 'view only' });
  });

  it('times out when nothing answers', async () => {
    vi.useFakeTimers();
    const { target } = fakeParent();
    const p = createPlatform(createBridgeTransport(target, 1000));
    const promise = p.getContext();
    const assertion = expect(promise).rejects.toBeInstanceOf(PlatformError);
    vi.advanceTimersByTime(1001);
    await assertion;
    vi.useRealTimers();
  });

  it('mock transport enforces grants like the platform', async () => {
    const p = createPlatform(createMockTransport());
    const list = await p.datasets.list();
    expect(list.map((d) => d.name)).toEqual(['kyc_cases', 'customers']);
    const q = await p.datasets.query('kyc_cases', { filter: { status: 'pending' }, limit: 5 });
    expect(q.rows.every((r) => r.status === 'pending')).toBe(true);
    await expect(p.datasets.query('refunds')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(p.datasets.update('customers', 'C-1001', { segment: 'vip' })).rejects.toMatchObject({ code: 'forbidden' });
    const updated = await p.datasets.update('kyc_cases', 'KYC-2001', { status: 'approved' });
    expect(updated.status).toBe('approved');
  });
});
