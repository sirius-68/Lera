import { createElement, useEffect, useMemo, useRef } from 'react';
import island from '../web/island';
import { compose, handle } from './handle';
import { attach, Msg } from './link';

/** Browser preview of the native app: the web screens sit in a frame instead of a phone's web view. */
export function Island() {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => compose(island, { platform: 'web', insets: { top: 0, bottom: 0 } }), []);

  useEffect(() => {
    attach((m: Msg) => frame.current?.contentWindow?.postMessage({ leraHost: m }, '*'));
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { lera?: string } | null;
      if (d && typeof d === 'object' && typeof d.lera === 'string') handle(JSON.parse(d.lera) as Msg);
    };
    window.addEventListener('message', onMessage);
    return () => {
      attach(null);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return createElement('iframe', { ref: frame, srcDoc: html, title: 'Lera', style: { border: 0, width: '100%', height: '100%', background: 'transparent' }, allowTransparency: 'true' });
}
