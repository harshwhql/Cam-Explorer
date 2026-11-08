import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Camera, Device, StreamQuality } from '@/core/types';
import { sourceForCamera } from '@/hooks/useCameras';
import { useStream } from '@/hooks/useStream';
import { Icon } from '@/ui/controls';
import { Focusable } from '@/ui/Focusable';
import { colors, fill, radius, type } from '@/ui/theme';
import { RtspPlayerView } from 'rtsp-player';
import { SnapshotPill, SnapshotView } from './SnapshotView';
import { LivePill, StreamOverlay } from './StreamStatus';

export interface CameraTileProps {
  camera: Camera;
  device: Device | undefined;
  quality: StreamQuality;
  active: boolean;
  showLabel: boolean;
  number: number;
  stallTimeoutMs: number;
  hasTVPreferredFocus?: boolean;
  onOpen: (camera: Camera) => void;
  /** Called on OK when the tile failed with a wrong password. */
  onFix?: (camera: Camera) => void;
  onFocusTile?: (camera: Camera) => void;
  /**
   * live = hardware-decoded video. snapshot = recorder JPEG ~1/s (no decoder; used when the device
   * has fewer hardware decoders than tiles). Non-Dahua devices without snapshots show a hint.
   */
  mode?: 'live' | 'snapshot';
  snapshotIntervalMs?: number;
  /** Recorder reports motion on this camera right now. */
  motion?: boolean;
}

function CameraTileImpl({
  camera,
  device,
  quality,
  active,
  showLabel,
  number,
  stallTimeoutMs,
  hasTVPreferredFocus,
  onOpen,
  onFix,
  onFocusTile,
  mode = 'live',
  snapshotIntervalMs,
  motion = false,
}: CameraTileProps) {
  const live = mode === 'live';
  const source = live ? sourceForCamera(device, camera, quality) : null;
  const { state, nativeSource, onStatus, retryNow } = useStream(source, active && live);

  const onPress = () => {
    // Wrong password → straight to the device settings. Broken tile → retry now.
    // Healthy tile → full screen.
    if (!live) onOpen(camera);
    else if (state.errorCode === 'auth' && state.phase === 'failed') onFix?.(camera);
    else if (state.phase === 'failed' || state.phase === 'retrying') retryNow();
    else onOpen(camera);
  };

  return (
    <Focusable
      testID={`tile-${camera.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${camera.name}, open full screen`}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onFocus={() => onFocusTile?.(camera)}
      lift={1}
      style={styles.tile}
    >
      {(focused) => (
        <>
          {live ? (
            <>
              <RtspPlayerView
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
                focusable={false}
                source={nativeSource}
                muted
                paused={!active}
                resizeMode="contain"
                surfaceType="surface"
                stallTimeoutMs={stallTimeoutMs}
                onStatus={onStatus}
              />
              <StreamOverlay state={state} compact />
            </>
          ) : device?.kind === 'dahua' ? (
            <SnapshotView device={device} channel={camera.channel} active={active} intervalMs={snapshotIntervalMs} />
          ) : (
            <View style={styles.idle} pointerEvents="none">
              <Text style={styles.idleText}>Highlight to watch live</Text>
            </View>
          )}
          <View style={styles.topRow} pointerEvents="none">
            <View style={styles.topLeft}>
              <Text style={styles.number}>{number}</Text>
              {motion ? (
                <View style={styles.motionPill}>
                  <Icon name="motion-sensor" size={11} color={colors.bg} />
                  <Text style={styles.motionText}>MOTION</Text>
                </View>
              ) : null}
            </View>
            {live ? <LivePill state={state} /> : device?.kind === 'dahua' ? <SnapshotPill /> : null}
          </View>
          {showLabel ? (
            <View style={styles.label} pointerEvents="none">
              <Text numberOfLines={1} style={styles.labelText}>
                {camera.name}
              </Text>
            </View>
          ) : null}
          <View pointerEvents="none" style={[styles.ring, motion && styles.ringMotion, focused && styles.ringFocused]} />
        </>
      )}
    </Focusable>
  );
}

export const CameraTile = memo(CameraTileImpl);

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  ring: {
    ...fill,
    borderRadius: radius.sm,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  ringFocused: { borderWidth: 3, borderColor: colors.focus },
  ringMotion: { borderWidth: 3, borderColor: colors.warn },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  motionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.warn,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  motionText: { color: colors.bg, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  idle: { ...fill, alignItems: 'center', justifyContent: 'center' },
  idleText: { color: colors.textDim, fontSize: type.label },
  topRow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  number: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: colors.overlay,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: colors.overlay,
  },
  labelText: { color: colors.text, fontSize: type.label, fontWeight: '600' },
});
