import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** False while the app is in the background / device is on another app or asleep. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** False while another screen is on top (e.g. grid while a camera is full screen). */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}

/** Re-render every `ms` while enabled (countdowns, clock). */
export function useNow(ms: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0); // refresh immediately so a countdown never starts stale
    const t = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [ms, enabled]);
  return now;
}
