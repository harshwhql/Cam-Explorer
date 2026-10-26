// Reconnect policy for live streams.

export type StreamErrorCode =
  | 'auth' // wrong username/password — NEVER auto-retry (recorder locks the account)
  | 'not_found' // wrong channel/path
  | 'unreachable' // host down / refused / no route
  | 'timeout' // connect or read timeout
  | 'stall' // stream stopped delivering frames
  | 'ended' // server closed the stream
  | 'decoder' // device could not decode (too many streams / unsupported codec)
  | 'unsupported' // unsupported codec/format
  | 'network' // this device lost its own network
  | 'unknown';

export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  factor: number;
  /** 0..1 — fraction of the delay that is randomised (avoids thundering herd on the NVR). */
  jitter: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1000, maxMs: 30000, factor: 2, jitter: 0.25 };

export function retryDelayMs(
  attempt: number,
  code: StreamErrorCode,
  opts: BackoffOptions = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number | null {
  if (!isRetriable(code)) return null;
  // A stall on a previously healthy stream is usually a blip: retry fast first.
  const base = code === 'stall' || code === 'ended' ? Math.min(500, opts.baseMs) : opts.baseMs;
  // Wrong path won't fix itself quickly — go slow. Decoder exhaustion is often transient
  // (another screen still releasing its decoders), so retry fast twice before slowing down.
  const slow =
    code === 'not_found' || ((code === 'decoder' || code === 'unsupported') && attempt >= 2);
  const floor = slow ? opts.maxMs / 2 : 0;
  const exp = Math.min(opts.maxMs, base * Math.pow(opts.factor, Math.max(0, attempt)));
  const delay = Math.max(floor, exp);
  const spread = delay * opts.jitter;
  const jittered = delay - spread + random() * spread * 2;
  return Math.round(Math.min(opts.maxMs * (1 + opts.jitter), Math.max(0, jittered)));
}

export function isRetriable(code: StreamErrorCode): boolean {
  return code !== 'auth';
}

export function describeError(code: StreamErrorCode): string {
  switch (code) {
    case 'auth':
      return 'Wrong username or password';
    case 'not_found':
      return 'Channel not found on recorder';
    case 'unreachable':
      return 'Recorder unreachable';
    case 'timeout':
      return 'Connection timed out';
    case 'stall':
      return 'Stream froze';
    case 'ended':
      return 'Stream ended';
    case 'decoder':
      return 'Video decoder busy';
    case 'unsupported':
      return 'Unsupported video format';
    case 'network':
      return 'No network';
    default:
      return 'Stream error';
  }
}
