import { MOTION_HOLD_MS, applyMotionPoll, clearDevice, livePriority, motionOrder, type MotionMap } from '../motion';

describe('motion state', () => {
  it('starts an episode and keeps its start time while motion continues', () => {
    let m: MotionMap = {};
    m = applyMotionPoll(m, 'nvr', [2], 1000);
    m = applyMotionPoll(m, 'nvr', [2], 2500);
    expect(m['nvr:2']).toEqual({ since: 1000, lastSeen: 2500 });
  });

  it('holds motion briefly after it stops (no flicker), then clears it', () => {
    let m: MotionMap = applyMotionPoll({}, 'nvr', [3], 0);
    m = applyMotionPoll(m, 'nvr', [], MOTION_HOLD_MS - 1);
    expect(m['nvr:3']).toBeDefined();
    m = applyMotionPoll(m, 'nvr', [], MOTION_HOLD_MS + 1);
    expect(m['nvr:3']).toBeUndefined();
  });

  it('never touches other recorders', () => {
    let m: MotionMap = applyMotionPoll({}, 'a', [1], 0);
    m = applyMotionPoll(m, 'b', [], MOTION_HOLD_MS * 10);
    expect(m['a:1']).toBeDefined();
    expect(clearDevice(m, 'a')).toEqual({});
  });

  it('returns the same object when nothing changed (cheap re-renders)', () => {
    const m: MotionMap = {};
    expect(applyMotionPoll(m, 'nvr', [], 5)).toBe(m);
    expect(clearDevice(m, 'nvr')).toBe(m);
  });

  it('orders newest motion first', () => {
    let m: MotionMap = applyMotionPoll({}, 'n', [1], 100);
    m = applyMotionPoll(m, 'n', [1, 4], 200);
    expect(motionOrder(m)).toEqual(['n:4', 'n:1']);
  });

  it('live decoder priority: current tile, then motion, then focus history', () => {
    const m = applyMotionPoll({}, 'n', [4], 1);
    expect(livePriority(['n:2', 'n:1'], m)).toEqual(['n:2', 'n:4', 'n:1']);
    expect(livePriority([], m)).toEqual(['n:4']);
  });
});
