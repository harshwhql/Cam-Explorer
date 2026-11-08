// PIN lock rules. Pure so they can be unit-tested; storage lives in src/storage/pinStore.ts.

export const PIN_MIN = 4;
export const PIN_MAX = 8;
/** Wrong attempts allowed before a wait is imposed. */
export const FREE_ATTEMPTS = 5;
export const BASE_LOCKOUT_MS = 30_000;
export const MAX_LOCKOUT_MS = 15 * 60_000;
/** After this long in the background the app locks again. */
export const RELOCK_AFTER_MS = 60_000;

export type PinScope = 'settings' | 'app';

export function validatePin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return 'Use digits only';
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) return `Use ${PIN_MIN}–${PIN_MAX} digits`;
  if (/^(\d)\1+$/.test(pin)) return 'Avoid repeating the same digit';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Avoid simple sequences';
  return null;
}

/** Wait imposed after `failures` wrong attempts in a row (0 = none). */
export function lockoutMs(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  const extra = failures - FREE_ATTEMPTS;
  return Math.min(MAX_LOCKOUT_MS, BASE_LOCKOUT_MS * 2 ** extra);
}

export interface FailState {
  failures: number;
  lastFailAt: number;
}

export const NO_FAILS: FailState = { failures: 0, lastFailAt: 0 };

/** Milliseconds until another attempt is allowed (0 = now). */
export function waitRemaining(s: FailState, now: number): number {
  const wait = lockoutMs(s.failures);
  return wait === 0 ? 0 : Math.max(0, s.lastFailAt + wait - now);
}

export function recordFailure(s: FailState, now: number): FailState {
  return { failures: s.failures + 1, lastFailAt: now };
}

/** Constant-time comparison (no early exit on the first wrong digit). */
export function pinMatches(entered: string, stored: string): boolean {
  if (!stored) return false;
  let diff = entered.length ^ stored.length;
  for (let i = 0; i < Math.max(entered.length, stored.length); i++) {
    diff |= (entered.charCodeAt(i) || 0) ^ (stored.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function sanitizeFailState(raw: unknown): FailState {
  if (typeof raw !== 'object' || raw === null) return NO_FAILS;
  const r = raw as Record<string, unknown>;
  const failures = typeof r.failures === 'number' && Number.isInteger(r.failures) && r.failures >= 0 ? Math.min(r.failures, 1000) : 0;
  const lastFailAt = typeof r.lastFailAt === 'number' && Number.isFinite(r.lastFailAt) ? r.lastFailAt : 0;
  return { failures, lastFailAt };
}
