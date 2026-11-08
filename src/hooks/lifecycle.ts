import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { addPipListener, isInPip } from 'rtsp-player';

/**
 * False while the app is in the background / device is on another app or asleep.
 * A picture-in-picture window counts as active (Android reports it as background).
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background' || isInPip());
  useEffect(() => {
    const update = () => setActive(AppState.currentState === 'active' || isInPip());
    const sub = AppState.addEventListener('change', update);
    const unPip = addPipListener(update);
    return () => {
      sub.remove();
      unPip();
    };
  }, []);
  return active;
}

/** True while the app is shown as a picture-in-picture window. */
export function usePip(): boolean {
  const [inPip, setInPip] = useState(isInPip);
  useEffect(() => addPipListener(setInPip), []);
  return inPip;
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
