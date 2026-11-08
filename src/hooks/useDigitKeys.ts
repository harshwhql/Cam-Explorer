import { useEffect, useRef, useState } from 'react';

import { DIGIT_TIMEOUT_MS, flushDigits, pushDigit } from '@/core/digits';
import { addDigitListener } from 'rtsp-player';

/**
 * Remote number keys → camera numbers (1-based, up to `max`). Returns the digits typed so
 * far so the screen can show them. Only listens while `enabled`.
 */
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
    const unsubscribe = subscribeDigits((digit) => {
      if (timer) clearTimeout(timer);
      apply(pushDigit(state.current.buffer, digit, state.current.max));
      if (state.current.buffer) {
        timer = setTimeout(() => apply(flushDigits(state.current.buffer, state.current.max)), DIGIT_TIMEOUT_MS);
      }
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      st.buffer = '';
    };
  }, [enabled]);

  return enabled ? buffer : '';
}

function subscribeDigits(listener: (digit: number) => void): () => void {
  return addDigitListener(listener);
}
