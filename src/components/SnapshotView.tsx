import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { bytesToBase64, isJpeg } from '@/core/base64';
import { DahuaClient, DahuaError, type DahuaErrorCode } from '@/core/dahua';
import type { DahuaDevice } from '@/core/types';
import { cachedPassword } from '@/storage/secrets';
import { Icon } from '@/ui/controls';
import { colors, fill, radius, space, type } from '@/ui/theme';

const STOP_CODES: DahuaErrorCode[] = ['auth', 'insecure_auth', 'not_dahua'];

/**
 * Near-live view without a video decoder: pulls the recorder's JPEG snapshot about once a
 * second. Used for grid tiles beyond the device's hardware-decoder budget.
 * Two image slots are alternated so a new frame only shows once it has decoded (no flicker).
 */
export function SnapshotView({
  device,
  channel,
  active,
  intervalMs = 1000,
}: {
  device: DahuaDevice;
  channel: number;
  active: boolean;
  intervalMs?: number;
}) {
  const [slots, setSlots] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const [front, setFront] = useState(0);
  const [error, setError] = useState<DahuaErrorCode | null>(null);
  const frontRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const client = new DahuaClient({
      host: device.host,
      port: device.httpPort,
      username: device.username,
      password: cachedPassword(device.id) ?? '',
      timeoutMs: 5000,
    });

    const tick = async () => {
      const started = Date.now();
      try {
        const bytes = await client.snapshot(channel);
        if (!alive) return;
        if (!isJpeg(bytes)) throw new DahuaError('http', 'Not an image');
        const uri = `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
        const back = 1 - frontRef.current;
        setSlots((s) => (back === 0 ? [uri, s[1]] : [s[0], uri]));
        setError(null);
      } catch (e) {
        if (!alive) return;
        const code: DahuaErrorCode = e instanceof DahuaError ? e.code : 'http';
        setError(code);
        // Never repeat a failed login (recorder lockout); unsupported → give up quietly.
        if (STOP_CODES.includes(code)) return;
      }
      timer = setTimeout(tick, Math.max(250, intervalMs - (Date.now() - started)));
    };
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [active, device.host, device.httpPort, device.username, device.id, channel, intervalMs]);

  const hasImage = slots[0] !== undefined || slots[1] !== undefined;
  return (
    <View style={styles.root} pointerEvents="none">
      {slots.map((uri, i) =>
        uri ? (
          <Image
            key={i}
            source={{ uri }}
            fadeDuration={0}
            resizeMode="contain"
            style={[fill, { zIndex: i === front ? 1 : 0 }]}
            onLoad={() => {
              if (frontRef.current !== i) {
                frontRef.current = i;
                setFront(i);
              }
            }}
          />
        ) : null,
      )}
      {!hasImage ? (
        <View style={styles.center}>
          {error ? (
            <>
              <Icon name={error === 'auth' ? 'lock-alert-outline' : 'image-off-outline'} size={22} color={colors.warn} />
              <Text style={styles.msg}>{error === 'auth' ? 'Wrong username or password' : 'Snapshot unavailable'}</Text>
            </>
          ) : (
            <ActivityIndicator color={colors.textDim} />
          )}
        </View>
      ) : null}
    </View>
  );
}

export function SnapshotPill() {
  return (
    <View style={styles.pill}>
      <Icon name="camera-timer" size={11} color={colors.textDim} />
      <Text style={styles.pillText}>1 FPS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...fill, backgroundColor: '#000' },
  center: { ...fill, alignItems: 'center', justifyContent: 'center', gap: space.xs, zIndex: 2 },
  msg: { color: colors.text, fontSize: type.label, textAlign: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillText: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
});
