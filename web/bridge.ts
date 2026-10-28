export interface BridgeRequest { type: 'itp:request'; id: string; method: string; params?: unknown }
export interface BridgeResponse { type: 'itp:response'; id: string; ok: boolean; result?: unknown; error?: unknown }

export type SdkCaller = (method: string, params: unknown) => Promise<{ ok: boolean; result?: unknown; error?: unknown }>;

export function isBridgeRequest(data: unknown): data is BridgeRequest {
  return !!data && typeof data === 'object' && (data as BridgeRequest).type === 'itp:request' && typeof (data as BridgeRequest).id === 'string' && typeof (data as BridgeRequest).method === 'string';
}

/**
 * Handles one window message for an app iframe. Returns false when the message was ignored
 * (wrong source or not an SDK request). Responses go back to the iframe with target '*'
 * because a sandboxed iframe without allow-same-origin has an opaque origin.
 */
export async function handleBridgeMessage(
  iframeWindow: Window | null,
  event: { source: unknown; data: unknown },
  call: SdkCaller,
  post: (msg: BridgeResponse) => void = (msg) => iframeWindow?.postMessage(msg, '*'),
): Promise<boolean> {
  if (!iframeWindow || event.source !== iframeWindow) return false;
  if (!isBridgeRequest(event.data)) return false;
  const { id, method, params } = event.data;
  try {
    const res = await call(method, params ?? {});
    post(res.ok ? { type: 'itp:response', id, ok: true, result: res.result } : { type: 'itp:response', id, ok: false, error: res.error });
  } catch (e) {
    post({ type: 'itp:response', id, ok: false, error: { code: 'invalid', message: e instanceof Error ? e.message : 'Request failed' } });
  }
  return true;
}

export function makeSdkCaller(slug: string, mode: 'live' | 'preview', requestId?: number): SdkCaller {
  return async (method, params) => {
    const res = await fetch(`/api/runtime/${encodeURIComponent(slug)}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, requestId, method, params }),
    });
    if (res.status === 401) return { ok: false, error: { code: 'forbidden', message: 'Please sign in again' } };
    return (await res.json()) as { ok: boolean; result?: unknown; error?: unknown };
  };
}
