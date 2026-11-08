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

/** Web preview: keydown/keyup → down/up events (hold-to-move controls such as PTZ). */
export function useRemoteKeys(handler: (e: RemoteEvent & { down: boolean }) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const make = (down: boolean) => (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (down && e.repeat) return;
      const eventType = KEYS[e.key];
      if (eventType) ref.current({ eventType, down });
    };
    const onDown = make(true);
    const onUp = make(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);
}
