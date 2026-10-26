import { useEffect, useRef } from 'react';

import type { RemoteEvent } from './useRemote';

export type { RemoteEvent } from './useRemote';

const KEYS: Record<string, string> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Enter: 'select',
  ' ': 'playPause',
  PageUp: 'channelUp',
  PageDown: 'channelDown',
  i: 'info',
  m: 'menu',
};

/** Web preview: map the keyboard onto remote-control events. */
export function useRemote(handler: (e: RemoteEvent) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const eventType = KEYS[e.key];
      if (eventType) ref.current({ eventType });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
