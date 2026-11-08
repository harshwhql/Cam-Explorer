import {
  BASE_LOCKOUT_MS,
  FREE_ATTEMPTS,
  MAX_LOCKOUT_MS,
  NO_FAILS,
  lockoutMs,
  pinMatches,
  recordFailure,
  sanitizeFailState,
  validatePin,
  waitRemaining,
} from '../pin';

describe('PIN lock', () => {
  it('validates PINs', () => {
    expect(validatePin('2580')).toBeNull();
    expect(validatePin('73914820')).toBeNull();
    expect(validatePin('123')).not.toBeNull();
    expect(validatePin('123456789')).not.toBeNull();
    expect(validatePin('12a4')).not.toBeNull();
    expect(validatePin('0000')).not.toBeNull();
    expect(validatePin('1234')).not.toBeNull();
    expect(validatePin('9876')).not.toBeNull();
  });

  it('allows a few free attempts, then escalates the wait up to a cap', () => {
    expect(lockoutMs(FREE_ATTEMPTS - 1)).toBe(0);
    expect(lockoutMs(FREE_ATTEMPTS)).toBe(BASE_LOCKOUT_MS);
    expect(lockoutMs(FREE_ATTEMPTS + 1)).toBe(BASE_LOCKOUT_MS * 2);
    expect(lockoutMs(FREE_ATTEMPTS + 30)).toBe(MAX_LOCKOUT_MS);
  });

  it('tracks the remaining wait', () => {
    let s = NO_FAILS;
    for (let i = 0; i < FREE_ATTEMPTS; i++) s = recordFailure(s, 1000);
    expect(waitRemaining(s, 1000)).toBe(BASE_LOCKOUT_MS);
    expect(waitRemaining(s, 1000 + BASE_LOCKOUT_MS)).toBe(0);
  });

  it('compares PINs exactly', () => {
    expect(pinMatches('2580', '2580')).toBe(true);
    expect(pinMatches('2581', '2580')).toBe(false);
    expect(pinMatches('25800', '2580')).toBe(false);
    expect(pinMatches('', '')).toBe(false);
  });

  it('sanitises persisted failure state', () => {
    expect(sanitizeFailState({ failures: 3, lastFailAt: 5 })).toEqual({ failures: 3, lastFailAt: 5 });
    expect(sanitizeFailState({ failures: -1, lastFailAt: 'x' })).toEqual({ failures: 0, lastFailAt: 0 });
    expect(sanitizeFailState(null)).toEqual(NO_FAILS);
  });
});
