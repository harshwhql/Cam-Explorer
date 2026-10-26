import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { INITIAL_STREAM_STATE, isAuthFailure, streamReducer, type StreamEvent, type StreamState } from '@/core/streamState';
import type { StreamSource } from '@/core/types';
import type { NativeSource, PlayerStatusEvent } from 'rtsp-player';
import { useAppStore } from '@/storage/store';

const reduce = (s: StreamState, e: StreamEvent) => streamReducer(s, e);

export interface StreamController {
  state: StreamState;
  nativeSource: NativeSource | null;
  onStatus: (e: { nativeEvent: PlayerStatusEvent }) => void;
  retryNow: () => void;
}

/**
 * Wires one native player to the tested reconnect state machine:
 * errors → backoff timer → reloadKey bump → native reconnects.
 */
export function useStream(source: StreamSource | null, active: boolean): StreamController {
  const [state, dispatch] = useReducer(reduce, INITIAL_STREAM_STATE);
  const networkEpoch = useAppStore((s) => s.networkEpoch);

  // Any change of what we're watching (or coming back on screen) starts fresh.
  const identity = source ? `${source.uri}|${source.username ?? ''}|${source.transport}|${source.password ?? ''}` : '';
  const first = useRef(true);
  const last = useRef({ identity, networkEpoch });
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const force = last.current.identity !== identity;
    // A new URL or un-pausing already restarts the native player; only network recovery
    // needs an explicit reconnect of a player that may still be open.
    const reconnect = last.current.networkEpoch !== networkEpoch && !force;
    last.current = { identity, networkEpoch };
    dispatch({ type: 'reset', force, reconnect });
  }, [identity, active, networkEpoch]);

  // Scheduled retry.
  useEffect(() => {
    if (!active || state.phase !== 'retrying' || state.retryAt === undefined) return;
    const t = setTimeout(() => dispatch({ type: 'retry' }), Math.max(0, state.retryAt - Date.now()));
    return () => clearTimeout(t);
  }, [active, state.phase, state.retryAt]);

  const onStatus = useCallback((e: { nativeEvent: PlayerStatusEvent }) => {
    const { state: s, code, message } = e.nativeEvent;
    dispatch({ type: 'status', state: s, code, message, now: Date.now(), random: Math.random() });
  }, []);

  const retryNow = useCallback(() => dispatch({ type: 'reset', force: true, reconnect: true }), []);

  // After a wrong password the player gets no source at all, so neither resume, re-attach nor
  // network changes can spend another login attempt. New credentials (identity) restart it.
  const authFailed = isAuthFailure(state);
  const nativeSource = useMemo<NativeSource | null>(
    () =>
      source && !authFailed
        ? {
            uri: source.uri,
            username: source.username,
            password: source.password,
            transport: source.transport,
            reloadKey: state.reloadKey,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [identity, state.reloadKey, authFailed],
  );

  return { state, nativeSource, onStatus, retryNow };
}
