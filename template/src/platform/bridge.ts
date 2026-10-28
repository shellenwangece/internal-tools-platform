import { PlatformError, type Transport } from './types';

/** Talks to the platform shell through window.postMessage. Used when the app runs inside the platform. */
export function createBridgeTransport(target: Window = window.parent, timeoutMs = 30000): Transport {
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let n = 0;
  window.addEventListener('message', (event: MessageEvent) => {
    const m = event.data as { type?: string; id?: string; ok?: boolean; result?: unknown; error?: { code?: string; message?: string } } | null;
    if (!m || m.type !== 'itp:response' || typeof m.id !== 'string') return;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.result);
    else p.reject(new PlatformError((m.error?.code as PlatformError['code']) ?? 'invalid', m.error?.message ?? 'Request failed'));
  });
  return {
    call<T>(method: string, params: unknown = {}): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const id = `req-${++n}-${Date.now()}`;
        const timer = setTimeout(() => { pending.delete(id); reject(new PlatformError('timeout', `The platform did not answer "${method}" in time`)); }, timeoutMs);
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        target.postMessage({ type: 'itp:request', id, method, params }, '*');
      });
    },
  };
}
