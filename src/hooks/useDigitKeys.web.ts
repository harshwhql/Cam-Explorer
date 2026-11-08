import { useEffect, useRef, useState } from 'react';

import { DIGIT_TIMEOUT_MS, flushDigits, pushDigit } from '@/core/digits';

/** Web preview: keyboard digits behave like remote number keys. */
export function useDigitKeys(max: number, enabled: boolean, onNumber: (n: number) => void): string {
  const [buffer, setBuffer] = useState('');
  const state = useRef({ buffer: '', max, onNumber });
  useEffect(() => {
    state.current.max = max;
    state.current.onNumber = onNumber;
  });

  useEffect(() => {
    if (!enabled) return;
    const st = state.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = (r: { buffer: string; commit?: number }) => {
      state.current.buffer = r.buffer;
      setBuffer(r.buffer);
      if (r.commit !== undefined) state.current.onNumber(r.commit);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (!/^[0-9]$/.test(e.key)) return;
      if (timer) clearTimeout(timer);
      apply(pushDigit(state.current.buffer, Number(e.key), state.current.max));
      if (state.current.buffer) {
        timer = setTimeout(() => apply(flushDigits(state.current.buffer, state.current.max)), DIGIT_TIMEOUT_MS);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer) clearTimeout(timer);
      st.buffer = '';
    };
  }, [enabled]);

  return enabled ? buffer : '';
}
