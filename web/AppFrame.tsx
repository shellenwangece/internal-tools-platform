import { useEffect, useRef } from 'react';
import { handleBridgeMessage, makeSdkCaller } from './bridge.js';

interface Props { slug: string; mode: 'live' | 'preview'; requestId?: number; src: string; title: string }

export function AppFrame({ slug, mode, requestId, src, title }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const call = makeSdkCaller(slug, mode, requestId);
    const onMessage = (event: MessageEvent) => { void handleBridgeMessage(ref.current?.contentWindow ?? null, event, call); };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [slug, mode, requestId]);
  return (
    <iframe
      ref={ref}
      className="app-frame"
      title={title}
      src={src}
      sandbox="allow-scripts allow-forms allow-popups"
      onLoad={() => ref.current?.contentWindow?.postMessage({ type: 'itp:ready' }, '*')}
    />
  );
}
