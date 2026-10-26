import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LivePill, StreamOverlay } from '@/components/StreamStatus';
import { stepIndex } from '@/core/layout';
import { useAppActive } from '@/hooks/lifecycle';
import { sourceForCamera, useCameras } from '@/hooks/useCameras';
import { useRemote } from '@/hooks/useRemote';
import { useStream } from '@/hooks/useStream';
import { useAppStore } from '@/storage/store';
import { useUiStore } from '@/storage/uiStore';
import { Button, Icon } from '@/ui/controls';
import { colors, isTV, space, tvSafe, type } from '@/ui/theme';
import { RtspPlayerView } from 'rtsp-player';

const OVERLAY_MS = 4000;
const DECODER_HANDOFF_MS = 250;

export default function CameraScreen() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cameras, byDevice } = useCameras();
  const settings = useAppStore((s) => s.settings);
  const appActive = useAppActive();
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(() => Math.max(0, cameras.findIndex((c) => c.id === id)));
  const [muted, setMuted] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Give the grid a moment to release its hardware decoders before we claim one
  // (many devices have few decoder instances).
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWarm(true), DECODER_HANDOFF_MS);
    return () => clearTimeout(t);
  }, []);

  const cam = cameras[index];
  const device = cam ? byDevice.get(cam.deviceId) : undefined;
  const source = cam && warm ? sourceForCamera(device, cam, settings.fullscreenQuality) : null;
  const { state, nativeSource, onStatus, retryNow } = useStream(source, appActive);

  const poke = useCallback(() => {
    setOverlay(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOverlay(false), OVERLAY_MS);
  }, []);

  useEffect(() => {
    hideTimer.current = setTimeout(() => setOverlay(false), OVERLAY_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    useUiStore.getState().setLastViewed(cam?.id ?? null);
  }, [cam?.id]);

  const switchBy = useCallback(
    (delta: number) => {
      if (cameras.length < 2) return;
      setIndex((i) => stepIndex(i, delta, cameras.length));
      setSize(null);
      poke();
    },
    [cameras.length, poke],
  );

  const toggleSound = useCallback(() => {
    setMuted((m) => !m);
    poke();
  }, [poke]);

  useRemote((evt) => {
    switch (evt.eventType) {
      case 'left':
      case 'channelDown':
      case 'previous':
      case 'rewind':
        switchBy(-1);
        break;
      case 'right':
      case 'channelUp':
      case 'next':
      case 'fastForward':
        switchBy(1);
        break;
      case 'playPause':
      case 'play':
      case 'pause':
        toggleSound();
        break;
      case 'up':
      case 'down':
      case 'info':
      case 'menu':
        poke();
        break;
      default:
        break;
    }
  });

  if (!cam) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This camera no longer exists.</Text>
        <Button label="Back to cameras" hasTVPreferredFocus onPress={() => router.back()} />
      </View>
    );
  }

  const onPress = () => {
    if (state.phase === 'failed' && state.errorCode !== 'auth') {
      retryNow();
      poke();
    } else if (isTV) {
      toggleSound();
    } else if (overlay) {
      setOverlay(false);
    } else {
      poke();
    }
  };

  const qualityLabel = settings.fullscreenQuality === 'main' ? 'HD' : 'SD';

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <Pressable
        style={StyleSheet.absoluteFill}
        hasTVPreferredFocus
        onPress={onPress}
        accessibilityLabel={`${cam.name} live`}
        accessibilityHint={isTV ? 'Left and right switch camera, OK toggles sound' : 'Tap to show controls'}
      >
        <RtspPlayerView
          key={cam.id}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          focusable={false}
          source={nativeSource}
          muted={muted}
          audioEnabled
          paused={!appActive}
          resizeMode="contain"
          surfaceType="surface"
          stallTimeoutMs={settings.stallTimeoutSec * 1000}
          onStatus={onStatus}
          onVideoSize={(e) => setSize(e.nativeEvent)}
        />
        <StreamOverlay state={state} />
      </Pressable>

      {overlay ? (
        <>
          <View
            pointerEvents="box-none"
            style={[
              styles.top,
              { paddingTop: Math.max(insets.top, tvSafe.vertical), paddingHorizontal: Math.max(insets.left, tvSafe.horizontal) },
            ]}
          >
            <View style={styles.titleBlock} pointerEvents="none">
              <Text style={styles.title} numberOfLines={1}>
                {cam.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {cam.deviceName} · {index + 1} / {cameras.length}
                {size ? ` · ${size.width}×${size.height}` : ''} · {qualityLabel}
              </Text>
            </View>
            <View style={styles.badges} pointerEvents="none">
              <LivePill state={state} />
              <View style={styles.soundBadge}>
                <Icon name={muted ? 'volume-off' : 'volume-high'} size={16} color={muted ? colors.textDim : colors.teal} />
              </View>
            </View>
            {!isTV ? <Button icon="close" variant="ghost" compact onPress={() => router.back()} accessibilityLabel="Close" /> : null}
          </View>

          <View
            pointerEvents="box-none"
            style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, tvSafe.vertical) }]}
          >
            {isTV ? (
              <Text style={styles.hint}>◀ ▶ switch camera · OK sound {muted ? 'on' : 'off'} · BACK grid</Text>
            ) : (
              <View style={styles.controls}>
                <Button icon="chevron-left" onPress={() => switchBy(-1)} accessibilityLabel="Previous camera" />
                <Button icon={muted ? 'volume-off' : 'volume-high'} onPress={toggleSound} accessibilityLabel="Toggle sound" />
                <Button icon="chevron-right" onPress={() => switchBy(1)} accessibilityLabel="Next camera" />
              </View>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingBottom: space.xl,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  titleBlock: { flex: 1 },
  title: { color: colors.text, fontSize: type.title, fontWeight: '800' },
  meta: { color: colors.textDim, fontSize: type.label, marginTop: 2 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  soundBadge: { backgroundColor: colors.overlay, borderRadius: 999, padding: 5 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  hint: {
    color: colors.textDim,
    fontSize: type.label,
    backgroundColor: colors.overlay,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 999,
    overflow: 'hidden',
  },
  controls: { flexDirection: 'row', gap: space.lg, padding: space.md },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, backgroundColor: colors.bg },
  missingText: { color: colors.text, fontSize: type.subtitle },
});
