import { parseRecordingItems } from '../dahua';
import { buildDahuaPlaybackUrl } from '../rtsp';
import {
  MINUTE,
  addDays,
  eventMarks,
  formatPlaybackTime,
  formatRecorderTime,
  jumpToEvent,
  mergeSpans,
  parseRecorderTime,
  playableFrom,
  startOfDay,
  type Recording,
} from '../timeline';

const t = (hh: number, mm = 0, ss = 0) => new Date(2026, 10, 9, hh, mm, ss).getTime();
const rec = (a: number, b: number, event = false): Recording => ({ start: a, end: b, event, events: event ? ['VideoMotion'] : [] });

describe('recorder time format', () => {
  it('round-trips local time', () => {
    expect(formatRecorderTime(t(9, 5, 7))).toBe('2026-11-09 09:05:07');
    expect(parseRecorderTime('2026-11-09 09:05:07')).toBe(t(9, 5, 7));
    expect(formatPlaybackTime(t(23, 59, 59))).toBe('2026_11_09_23_59_59');
  });

  it('rejects malformed and impossible dates', () => {
    expect(parseRecorderTime('2026-02-31 10:00:00')).toBeNaN();
    expect(parseRecorderTime('garbage')).toBeNaN();
    expect(parseRecorderTime(undefined)).toBeNaN();
  });

  it('day helpers', () => {
    expect(startOfDay(t(15, 30))).toBe(t(0));
    expect(addDays(t(0), -1)).toBe(new Date(2026, 10, 8).getTime());
  });
});

describe('timeline', () => {
  it('merges adjacent files into continuous spans, clipped to the day', () => {
    const spans = mergeSpans([rec(t(1), t(2)), rec(t(2), t(3)), rec(t(5), t(6)), rec(t(23), t(25))], t(0), t(24));
    expect(spans).toEqual([
      { start: t(1), end: t(3) },
      { start: t(5), end: t(6) },
      { start: t(23), end: t(24) },
    ]);
  });

  it('marks motion events and jumps between them', () => {
    const marks = eventMarks([rec(t(4), t(4, 2), true), rec(t(4, 0, 30), t(4, 1), true), rec(t(8), t(9)), rec(t(10), t(10, 5), true)], t(0), t(24));
    expect(marks).toEqual([t(4), t(10)]);
    expect(jumpToEvent(marks, t(6), 1)).toBe(t(10));
    expect(jumpToEvent(marks, t(6), -1)).toBe(t(4));
    expect(jumpToEvent(marks, t(11), 1)).toBeNull();
  });

  it('finds the next playable moment', () => {
    const spans = [{ start: t(1), end: t(2) }, { start: t(5), end: t(6) }];
    expect(playableFrom(spans, t(1, 30))).toBe(t(1, 30));
    expect(playableFrom(spans, t(3))).toBe(t(5));
    expect(playableFrom(spans, t(7))).toBeNull();
  });
});

describe('recorder search results', () => {
  it('parses items, flags and events; drops broken ones', () => {
    const body = [
      'found=3',
      'items[0].Channel=0',
      'items[0].StartTime=2026-11-09 10:00:00',
      'items[0].EndTime=2026-11-09 11:00:00',
      'items[0].Flags[0]=Timing',
      'items[1].StartTime=2026-11-09 11:00:00',
      'items[1].EndTime=2026-11-09 11:10:00',
      'items[1].Flags[0]=Event',
      'items[1].Events[0]=VideoMotion',
      'items[2].StartTime=2026-11-09 12:00:00',
      'items[2].EndTime=2026-11-09 11:00:00',
    ].join('\r\n');
    expect(parseRecordingItems(body)).toEqual([
      { start: t(10), end: t(11), event: false, events: [] },
      { start: t(11), end: t(11, 10), event: true, events: ['VideoMotion'] },
    ]);
  });
});

describe('playback URL', () => {
  it('builds the CP Plus / Dahua playback URL', () => {
    expect(buildDahuaPlaybackUrl('192.168.1.108', 554, 2, t(10), t(10) + 30 * MINUTE)).toBe(
      'rtsp://192.168.1.108:554/cam/playback?channel=2&starttime=2026_11_09_10_00_00&endtime=2026_11_09_10_30_00',
    );
  });

  it('validates inputs', () => {
    expect(() => buildDahuaPlaybackUrl('bad host', 554, 1, t(1), t(2))).toThrow();
    expect(() => buildDahuaPlaybackUrl('192.168.1.108', 554, 1, t(2), t(1))).toThrow();
  });
});
