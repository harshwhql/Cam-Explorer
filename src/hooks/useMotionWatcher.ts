import { useEffect } from 'react';

import { DahuaClient, DahuaError } from '@/core/dahua';
import type { DahuaDevice } from '@/core/types';
import { cachedPassword } from '@/storage/secrets';
import { useAppStore } from '@/storage/store';
import { useMotionStore } from '@/storage/motionStore';

export const MOTION_POLL_MS = 1500;

/**
 * Polls every CP Plus / Dahua recorder for channels with motion while `enabled`.
 * A wrong password stops polling for that recorder for good (no lockout); network errors
 * back off to 5 s and recover on their own.
 */
export function useMotionWatcher(enabled: boolean): void {
  const devices = useAppStore((s) => s.devices);

  useEffect(() => {
    if (!enabled) return;
    const dahua = devices.filter((d): d is DahuaDevice => d.kind === 'dahua');
    const stops = dahua.map((device) => watch(device));
    return () => {
      for (const stop of stops) stop();
      for (const d of dahua) useMotionStore.getState().clear(d.id);
    };
  }, [enabled, devices]);
}

function watch(device: DahuaDevice): () => void {
  let alive = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const client = new DahuaClient({
    host: device.host,
    port: device.httpPort,
    username: device.username,
    password: cachedPassword(device.id) ?? '',
    timeoutMs: 4000,
  });
  const enabledChannels = new Set(device.channels.filter((c) => c.enabled).map((c) => c.number));

  const tick = async () => {
    let delay = MOTION_POLL_MS;
    try {
      const active = (await client.motionChannels()).filter((ch) => enabledChannels.has(ch));
      if (!alive) return;
      useMotionStore.getState().report(device.id, active);
    } catch (e) {
      if (!alive) return;
      if (e instanceof DahuaError && (e.code === 'auth' || e.code === 'insecure_auth')) return; // stop for good
      delay = 5000;
    }
    if (alive) timer = setTimeout(tick, delay);
  };
  tick();
  return () => {
    alive = false;
    if (timer) clearTimeout(timer);
  };
}
