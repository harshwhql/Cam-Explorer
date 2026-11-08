// Motion state per camera, fed by recorder polling. Pure so it can be unit-tested.

/** Keep a camera "in motion" this long after the recorder stops reporting it (avoids flicker). */
export const MOTION_HOLD_MS = 6000;

export interface MotionEntry {
  /** When this motion episode started. */
  since: number;
  /** Last time the recorder reported motion. */
  lastSeen: number;
}

export type MotionMap = Readonly<Record<string, MotionEntry>>;

export const cameraKey = (deviceId: string, channel: number) => `${deviceId}:${channel}`;

/**
 * Merge one poll result for a device. `active` = 1-based channels reporting motion now.
 * Returns the same object when nothing changed (cheap for React selectors).
 */
export function applyMotionPoll(prev: MotionMap, deviceId: string, active: number[], now: number): MotionMap {
  const next: Record<string, MotionEntry> = { ...prev };
  let changed = false;
  const activeKeys = new Set(active.map((ch) => cameraKey(deviceId, ch)));

  for (const key of activeKeys) {
    const old = next[key];
    next[key] = { since: old?.since ?? now, lastSeen: now };
    changed = true;
  }
  for (const [key, entry] of Object.entries(next)) {
    if (!key.startsWith(`${deviceId}:`) || activeKeys.has(key)) continue;
    if (now - entry.lastSeen > MOTION_HOLD_MS) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? next : prev;
}

/** Drop everything for a device (deleted, or polling stopped). */
export function clearDevice(prev: MotionMap, deviceId: string): MotionMap {
  const keys = Object.keys(prev).filter((k) => k.startsWith(`${deviceId}:`));
  if (!keys.length) return prev;
  const next = { ...prev };
  for (const k of keys) delete next[k];
  return next;
}

/** Camera ids in motion, newest episode first. */
export function motionOrder(map: MotionMap): string[] {
  return Object.entries(map)
    .sort((a, b) => b[1].since - a[1].since)
    .map(([id]) => id);
}

/**
 * Priority for scarce live decoders: the tile the user is on, then cameras with motion
 * (newest first), then the rest of the focus history.
 */
export function livePriority(recentFocus: string[], motion: MotionMap): string[] {
  const [current, ...older] = recentFocus;
  return [...(current ? [current] : []), ...motionOrder(motion), ...older];
}
