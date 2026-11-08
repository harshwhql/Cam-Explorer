import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DahuaClient, NO_PTZ, hasPtz, type PtzCaps, type PtzCode } from '@/core/dahua';
import type { Device } from '@/core/types';
import { cachedPassword } from '@/storage/secrets';

/** Max length of one continuous move — protects against a lost key-release. */
export const PTZ_MAX_MOVE_MS = 10_000;

export interface PtzController {
  caps: PtzCaps;
  supported: boolean;
  moving: PtzCode | null;
  start(code: PtzCode): void;
  stop(): void;
}

/**
 * Pan/tilt/zoom for one CP Plus / Dahua channel. Moves are "hold to move": start() on press,
 * stop() on release. A stop is always sent on unmount and after PTZ_MAX_MOVE_MS.
 */
export function usePtz(device: Device | undefined, channel: number | undefined, speed = 4): PtzController {
  const [caps, setCaps] = useState<PtzCaps>(NO_PTZ);
  const [moving, setMoving] = useState<PtzCode | null>(null);
  const client = useRef<DahuaClient | null>(null);
  const movingRef = useRef<PtzCode | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    client.current = null;
    if (!device || device.kind !== 'dahua' || !channel) return;
    let alive = true;
    const c = new DahuaClient({
      host: device.host,
      port: device.httpPort,
      username: device.username,
      password: cachedPassword(device.id) ?? '',
      timeoutMs: 4000,
    });
    client.current = c;
    c.ptzCaps(channel)
      .then((r) => alive && setCaps(r))
      .catch(() => alive && setCaps(NO_PTZ));
    return () => {
      alive = false;
      setCaps(NO_PTZ);
    };
  }, [device, channel]);

  const stop = useCallback(() => {
    if (safety.current) clearTimeout(safety.current);
    const code = movingRef.current;
    movingRef.current = null;
    setMoving(null);
    if (code && client.current && channel) client.current.ptzMove(channel, 'stop', code, speed).catch(() => undefined);
  }, [channel, speed]);

  const start = useCallback(
    (code: PtzCode) => {
      if (!client.current || !channel || movingRef.current === code) return;
      if (movingRef.current) stop();
      movingRef.current = code;
      setMoving(code);
      client.current.ptzMove(channel, 'start', code, speed).catch(() => undefined);
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(stop, PTZ_MAX_MOVE_MS);
    },
    [channel, speed, stop],
  );

  // Never leave a camera moving when the screen goes away.
  useEffect(() => () => stop(), [stop]);

  return useMemo(() => ({ caps, supported: hasPtz(caps), moving, start, stop }), [caps, moving, start, stop]);
}
