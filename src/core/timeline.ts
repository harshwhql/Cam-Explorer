// Recording timeline maths for playback. Times are epoch ms in the recorder's (= device's)
// local time zone. Pure so it can be unit-tested.

export interface Recording {
  start: number;
  end: number;
  /** Recorded because of an event (motion etc.) rather than continuous schedule. */
  event: boolean;
  /** Event codes reported for this file, e.g. ["VideoMotion"]. */
  events: string[];
}

export interface Span {
  start: number;
  end: number;
}

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

/** "YYYY-MM-DD HH:MM:SS" (recorder local time) → epoch ms, or NaN. */
export function parseRecorderTime(s: string | undefined): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return Number.NaN;
  const [, y, mo, d, h, mi, se] = m.map(Number) as number[];
  const t = new Date(y!, mo! - 1, d!, h!, mi!, se!);
  // Reject roll-overs such as 2026-02-31.
  return t.getMonth() === mo! - 1 && t.getDate() === d! ? t.getTime() : Number.NaN;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** epoch ms → "YYYY-MM-DD HH:MM:SS" (local), the recorder's search format. */
export function formatRecorderTime(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** epoch ms → "YYYY_MM_DD_HH_MM_SS" (local), the playback URL format. */
export function formatPlaybackTime(t: number): string {
  return formatRecorderTime(t).replace(/[- :]/g, '_');
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Same calendar day ± n days (DST-safe). */
export function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

export function formatClock(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Merge overlapping/adjacent (≤ gap) recordings into continuous spans, clipped to [from, to). */
export function mergeSpans(recs: Recording[], from: number, to: number, gapMs = 5000): Span[] {
  const clipped = recs
    .map((r) => ({ start: Math.max(r.start, from), end: Math.min(r.end, to) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const r of clipped) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + gapMs) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Start times of motion/event recordings in [from, to), sorted, de-duplicated within 1 min. */
export function eventMarks(recs: Recording[], from: number, to: number): number[] {
  const starts = recs
    .filter((r) => r.event || r.events.length > 0)
    .map((r) => r.start)
    .filter((t) => t >= from && t < to)
    .sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of starts) if (!out.length || t - out[out.length - 1]! >= MINUTE) out.push(t);
  return out;
}

/** Next (dir 1) / previous (dir -1) event mark from the cursor, or null. */
export function jumpToEvent(marks: number[], cursor: number, dir: 1 | -1): number | null {
  if (dir > 0) return marks.find((t) => t > cursor + 1000) ?? null;
  for (let i = marks.length - 1; i >= 0; i--) if (marks[i]! < cursor - 1000) return marks[i]!;
  return null;
}

/** Is there footage at `t`? If not, the start of the next span (for "play from here"). */
export function playableFrom(spans: Span[], t: number): number | null {
  for (const s of spans) {
    if (t >= s.start && t < s.end) return t;
    if (s.start > t) return s.start;
  }
  return null;
}

export function clamp(t: number, from: number, to: number): number {
  return Math.min(to, Math.max(from, t));
}
