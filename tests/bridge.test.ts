import { describe, expect, it, vi } from 'vitest';
import { handleBridgeMessage, type BridgeResponse } from '../web/bridge.js';

const iframeWindow = {} as Window;
const strangerWindow = {} as Window;

describe('postMessage bridge', () => {
  it('forwards valid requests from the iframe and answers with the same id', async () => {
    const call = vi.fn(async () => ({ ok: true, result: { rows: [1] } }));
    const posted: BridgeResponse[] = [];
    const handled = await handleBridgeMessage(iframeWindow, { source: iframeWindow, data: { type: 'itp:request', id: 'r1', method: 'datasets.query', params: { name: 'refunds' } } }, call, (m) => posted.push(m));
    expect(handled).toBe(true);
    expect(call).toHaveBeenCalledWith('datasets.query', { name: 'refunds' });
    expect(posted).toEqual([{ type: 'itp:response', id: 'r1', ok: true, result: { rows: [1] } }]);
  });

  it('ignores forged messages from other windows', async () => {
    const call = vi.fn();
    const handled = await handleBridgeMessage(iframeWindow, { source: strangerWindow, data: { type: 'itp:request', id: 'x', method: 'getContext' } }, call);
    expect(handled).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });

  it('ignores unrelated messages and relays errors', async () => {
    const call = vi.fn(async () => ({ ok: false, error: { code: 'forbidden', message: 'nope' } }));
    expect(await handleBridgeMessage(iframeWindow, { source: iframeWindow, data: { type: 'webpackOk' } }, call)).toBe(false);
    expect(await handleBridgeMessage(iframeWindow, { source: iframeWindow, data: 'hello' }, call)).toBe(false);
    const posted: BridgeResponse[] = [];
    await handleBridgeMessage(iframeWindow, { source: iframeWindow, data: { type: 'itp:request', id: 'r2', method: 'datasets.update' } }, call, (m) => posted.push(m));
    expect(posted[0]).toMatchObject({ id: 'r2', ok: false, error: { code: 'forbidden' } });
  });
});
