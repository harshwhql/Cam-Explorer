import { DEFAULT_BACKOFF, isRetriable, retryDelayMs } from '../backoff';
import { clampPage, gridShape, layoutsWithinBudget, pageCount, pageItems, pickLiveIds, snapshotIntervalMs, stepIndex, stepPage, suggestLayout } from '../layout';
import { INITIAL_STREAM_STATE, STABLE_AFTER_MS, streamReducer, type StreamState } from '../streamState';

const mid = () => 0.5; // jitter-neutral

describe('backoff', () => {
  it('grows exponentially and caps', () => {
    const d = [0, 1, 2, 3, 4, 5, 6, 10].map((a) => retryDelayMs(a, 'unreachable', DEFAULT_BACKOFF, mid));
    expect(d).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('keeps jitter within ±25%', () => {
    expect(retryDelayMs(2, 'timeout', DEFAULT_BACKOFF, () => 0)).toBe(3000);
    expect(retryDelayMs(2, 'timeout', DEFAULT_BACKOFF, () => 0.999999)).toBe(5000);
  });

  it('never retries a wrong password (avoids NVR account lockout)', () => {
    expect(isRetriable('auth')).toBe(false);
    expect(retryDelayMs(0, 'auth')).toBeNull();
  });

  it('retries stalls quickly and hopeless errors slowly', () => {
    expect(retryDelayMs(0, 'stall', DEFAULT_BACKOFF, mid)).toBe(500);
    expect(retryDelayMs(0, 'not_found', DEFAULT_BACKOFF, mid)).toBe(15000);
    // decoder busy is usually transient (screen switch) → quick first retries, then slow
    expect(retryDelayMs(0, 'decoder', DEFAULT_BACKOFF, mid)).toBe(1000);
    expect(retryDelayMs(1, 'decoder', DEFAULT_BACKOFF, mid)).toBe(2000);
    expect(retryDelayMs(2, 'decoder', DEFAULT_BACKOFF, mid)).toBe(15000);
  });
});

describe('stream state machine', () => {
  const status = (state: string, now = 0, code?: string) =>
    ({ type: 'status', state, code, now, random: 0.5 }) as const;

  it('connecting → playing', () => {
    let s = streamReducer(INITIAL_STREAM_STATE, status('connecting'));
    expect(s.phase).toBe('connecting');
    s = streamReducer(s, status('playing', 100));
    expect(s).toMatchObject({ phase: 'playing', playingSince: 100, errorCode: undefined });
  });

  it('error schedules a retry, retry bumps reloadKey and attempt', () => {
    let s = streamReducer(INITIAL_STREAM_STATE, status('error', 1000, 'unreachable'));
    expect(s).toMatchObject({ phase: 'retrying', errorCode: 'unreachable', retryAt: 2000, attempt: 0 });
    s = streamReducer(s, { type: 'retry' });
    expect(s).toMatchObject({ phase: 'connecting', attempt: 1, reloadKey: 1 });
    s = streamReducer(s, status('error', 5000, 'unreachable'));
    expect(s.retryAt).toBe(7000); // attempt 1 → 2 s
  });

  it('auth errors stop for good', () => {
    const s = streamReducer(INITIAL_STREAM_STATE, status('error', 0, 'auth'));
    expect(s.phase).toBe('failed');
    expect(streamReducer(s, { type: 'retry' })).toBe(s);
  });

  it('a stale "connecting" event does not hide a pending retry', () => {
    const s = streamReducer(INITIAL_STREAM_STATE, status('error', 0, 'timeout'));
    expect(streamReducer(s, status('connecting')).phase).toBe('retrying');
  });

  it('resets the failure counter only after a stable period', () => {
    let s: StreamState = { ...INITIAL_STREAM_STATE, attempt: 5 };
    s = streamReducer(s, status('playing', 0));
    const flap = streamReducer(s, status('error', 5000, 'stall'));
    expect(flap.attempt).toBe(5);
    const stable = streamReducer(s, status('error', STABLE_AFTER_MS + 1, 'stall'));
    expect(stable.attempt).toBe(0);
  });

  it('unknown codes are treated as generic (still retried)', () => {
    const s = streamReducer(INITIAL_STREAM_STATE, status('error', 0, 'weird_code'));
    expect(s).toMatchObject({ phase: 'retrying', errorCode: 'unknown' });
  });

  it('reset starts fresh with a new reloadKey', () => {
    const s = streamReducer({ phase: 'retrying', attempt: 7, reloadKey: 3, errorCode: 'timeout' }, { type: 'reset' });
    // no reconnect flag: native restarts by itself (un-pause / new URL) → no double connect
    expect(s).toEqual({ phase: 'connecting', attempt: 0, reloadKey: 3 });
    const r = streamReducer({ phase: 'playing', attempt: 0, reloadKey: 3 }, { type: 'reset', reconnect: true });
    expect(r.reloadKey).toBe(4);
  });

  it('a wrong password survives pause/resume/network changes (no extra login attempts)', () => {
    const failed = streamReducer(INITIAL_STREAM_STATE, status('error', 0, 'auth'));
    expect(streamReducer(failed, status('paused'))).toBe(failed);
    expect(streamReducer(failed, status('idle'))).toBe(failed);
    expect(streamReducer(failed, { type: 'reset' })).toBe(failed);
    // ...but new credentials (identity change) do retry.
    expect(streamReducer(failed, { type: 'reset', force: true })).toMatchObject({ phase: 'connecting' });
  });

  it('buffering keeps the playing timestamp', () => {
    let s = streamReducer(INITIAL_STREAM_STATE, status('playing', 10));
    s = streamReducer(s, status('buffering', 20));
    s = streamReducer(s, status('playing', 30));
    expect(s.playingSince).toBe(10);
  });
});

describe('layout', () => {
  it('grid shapes', () => {
    expect(gridShape(4)).toEqual({ cols: 2, rows: 2 });
    expect(gridShape(16)).toEqual({ cols: 4, rows: 4 });
    expect(gridShape(9, true)).toEqual({ cols: 2, rows: 5 });
    expect(gridShape(1, true)).toEqual({ cols: 1, rows: 1 });
  });

  it('paging', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(pageCount(10, 4)).toBe(3);
    expect(pageCount(0, 4)).toBe(1);
    expect(pageItems(items, 2, 4)).toEqual([8, 9]);
    expect(pageItems(items, 99, 4)).toEqual([8, 9]);
    expect(clampPage(-3, 10, 4)).toBe(0);
    expect(clampPage(Number.NaN, 10, 4)).toBe(0);
    expect(stepPage(2, 1, 10, 4)).toBe(0);
    expect(stepPage(0, -1, 10, 4)).toBe(2);
    expect(stepIndex(0, -1, 5)).toBe(4);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  it('respects the decoder budget', () => {
    expect(layoutsWithinBudget(4)).toEqual([1, 4]);
    expect(layoutsWithinBudget(32)).toEqual([1, 4, 9, 16]);
    expect(layoutsWithinBudget(0)).toEqual([1]);
    expect(suggestLayout(6, 16)).toBe(9);
    expect(suggestLayout(6, 4)).toBe(4);
    expect(suggestLayout(30, 32)).toBe(16);
  });
});

describe('live tile selection (hardware decoder budget)', () => {
  const page = ['a', 'b', 'c', 'd'];
  it('all live when the budget allows', () => {
    expect([...pickLiveIds(page, [], 16)]).toEqual(page);
  });
  it('first tiles live by default, focused tiles win', () => {
    expect([...pickLiveIds(page, [], 2)]).toEqual(['a', 'b']);
    expect([...pickLiveIds(page, ['d'], 2)]).toEqual(['d', 'a']);
    expect([...pickLiveIds(page, ['c', 'd', 'a'], 2)]).toEqual(['c', 'd']);
  });
  it('ignores focus history from other pages', () => {
    expect([...pickLiveIds(page, ['x', 'y'], 2)]).toEqual(['a', 'b']);
  });
  it('slows snapshots down when many tiles poll', () => {
    expect(snapshotIntervalMs(2)).toBe(1000);
    expect(snapshotIntervalMs(14)).toBe(4200);
  });
});
