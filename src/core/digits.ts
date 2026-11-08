// Remote number-key entry: "1" → camera 1, "1","2" quickly → camera 12. Pure + testable.

/** How long to wait for another digit before acting on what was typed. */
export const DIGIT_TIMEOUT_MS = 1200;

export interface DigitResult {
  /** Digits still being typed (shown on screen). */
  buffer: string;
  /** A finished camera number (1-based) to act on now. */
  commit?: number;
}

/**
 * Add a digit. Commits immediately when no further digit could form a valid number
 * (e.g. "3" with 9 cameras), otherwise waits for more / the timeout.
 */
export function pushDigit(buffer: string, digit: number, max: number): DigitResult {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9 || max < 1) return { buffer };
  const next = `${buffer}${digit}`.replace(/^0+/, '');
  if (!next) return { buffer: '' };
  const n = Number(next);
  if (n > max) {
    // Too big: fall back to just this digit as a fresh number.
    return digit >= 1 && digit <= max ? pushDigit('', digit, max) : { buffer: '' };
  }
  if (n * 10 > max) return { buffer: '', commit: n };
  return { buffer: next };
}

/** Timeout reached: act on whatever is buffered. */
export function flushDigits(buffer: string, max: number): DigitResult {
  const n = Number(buffer);
  return Number.isInteger(n) && n >= 1 && n <= max ? { buffer: '', commit: n } : { buffer: '' };
}
