// Per-tile stream state machine. Pure (randomness + time are passed in) so it is fully testable.
import { BackoffOptions, DEFAULT_BACKOFF, StreamErrorCode, retryDelayMs } from './backoff';

export type StreamPhase = 'idle' | 'connecting' | 'playing' | 'buffering' | 'retrying' | 'failed' | 'paused';

export interface StreamState {
  phase: StreamPhase;
  attempt: number;
  reloadKey: number;
  errorCode?: StreamErrorCode;
  message?: string;
  retryAt?: number;
  playingSince?: number;
}

export type StreamEvent =
  | { type: 'status'; state: string; code?: string; message?: string; now: number; random: number }
  | { type: 'retry' }
  /**
   * force = what we are watching changed (new URL/credentials), so even a wrong-password state restarts.
   * reconnect = bump reloadKey so a still-open native player reconnects (network back, manual retry).
   * Without it the native side restarts on its own (new URL / un-pause) and a bump would double-connect.
   */
  | { type: 'reset'; force?: boolean; reconnect?: boolean }
  | { type: 'offline' };

export const INITIAL_STREAM_STATE: StreamState = { phase: 'idle', attempt: 0, reloadKey: 0 };

/** A stream must play this long before its failure counter resets (prevents fast flapping loops). */
export const STABLE_AFTER_MS = 30_000;

const KNOWN_CODES: StreamErrorCode[] = [
  'auth',
  'not_found',
  'unreachable',
  'timeout',
  'stall',
  'ended',
  'decoder',
  'unsupported',
  'network',
  'unknown',
];

export function toErrorCode(code: string | undefined): StreamErrorCode {
  return KNOWN_CODES.includes(code as StreamErrorCode) ? (code as StreamErrorCode) : 'unknown';
}

export function isAuthFailure(s: StreamState): boolean {
  return s.phase === 'failed' && s.errorCode === 'auth';
}

export function streamReducer(
  s: StreamState,
  e: StreamEvent,
  opts: BackoffOptions = DEFAULT_BACKOFF,
): StreamState {
  switch (e.type) {
    case 'status': {
      switch (e.state) {
        case 'playing':
          return {
            ...s,
            phase: 'playing',
            errorCode: undefined,
            message: undefined,
            retryAt: undefined,
            playingSince: s.phase === 'playing' || s.phase === 'buffering' ? s.playingSince : e.now,
          };
        case 'buffering':
          return { ...s, phase: 'buffering' };
        case 'connecting':
          return s.phase === 'retrying' || s.phase === 'failed' ? s : { ...s, phase: 'connecting' };
        case 'paused':
        case 'idle':
          // A wrong password stays visible until the credentials change (never re-attempt a login).
          if (isAuthFailure(s)) return s;
          return { ...s, phase: e.state };
        case 'error': {
          const code = toErrorCode(e.code);
          const wasStable = s.playingSince !== undefined && e.now - s.playingSince >= STABLE_AFTER_MS;
          const attempt = wasStable ? 0 : s.attempt;
          const delay = retryDelayMs(attempt, code, opts, () => e.random);
          if (delay === null) {
            return { ...s, phase: 'failed', attempt, errorCode: code, message: e.message, retryAt: undefined, playingSince: undefined };
          }
          return {
            ...s,
            phase: 'retrying',
            attempt,
            errorCode: code,
            message: e.message,
            retryAt: e.now + delay,
            playingSince: undefined,
          };
        }
        default:
          return s;
      }
    }
    case 'retry':
      if (s.phase !== 'retrying') return s;
      return { ...s, phase: 'connecting', attempt: s.attempt + 1, reloadKey: s.reloadKey + 1, retryAt: undefined };
    case 'reset':
      if (isAuthFailure(s) && !e.force) return s;
      return { phase: 'connecting', attempt: 0, reloadKey: e.reconnect ? s.reloadKey + 1 : s.reloadKey };
    case 'offline':
      return { ...s, phase: 'failed', errorCode: 'network', retryAt: undefined, playingSince: undefined };
    default:
      return s;
  }
}
