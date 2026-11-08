import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LivePill, StreamOverlay } from '@/components/StreamStatus';
import { stepIndex } from '@/core/layout';
import { NO_ZOOM, PAN_STEP, dragPan, panBy, pinchZoom, stepZoom, type ZoomState } from '@/core/zoom';
import { useAppActive, usePip } from '@/hooks/lifecycle';
import { useDigitKeys } from '@/hooks/useDigitKeys';
import { sourceForCamera, useCameras } from '@/hooks/useCameras';
import { useRemote } from '@/hooks/useRemote';
import { useStream } from '@/hooks/useStream';
import { useAppStore } from '@/storage/store';
import { useUiStore } from '@/storage/uiStore';
import { Button, Icon } from '@/ui/controls';
import { colors, isTV, space, tvSafe, type } from '@/ui/theme';
import { RtspPlayerView, configurePip, enterPip } from 'rtsp-player';

const OVERLAY_MS = 4000;
const DECODER_HANDOFF_MS = 250;

export default function CameraScreen() {
  useKeepAwake();
  const { id, popup } = useLocalSearchParams<{ id: string; popup?: string }>();
  const { cameras, byDevice } = useCameras();
  const settings = useAppStore((s) => s.settings);
  const appActive = useAppActive();
  const inPip = usePip();
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(() => Math.max(0, cameras.findIndex((c) => c.id === id)));
  const [muted, setMuted] = useState(true);
  const [overlay, setOverlay] = useState(true);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [zoom, setZoom] = useState<ZoomState>(NO_ZOOM);
  const zoomRef = useRef(zoom);
  const { width, height } = useWindowDimensions();
  const viewSize = useRef({ width, height });
  useEffect(() => {
    zoomRef.current = zoom;
    viewSize.current = { width, height };
  }, [zoom, width, height]);

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

  // Home → keep watching in a picture-in-picture window (sized to the video).
  useEffect(() => {
    configurePip(true, size?.width ?? 16, size?.height ?? 9);
  }, [size?.width, size?.height]);
  useEffect(() => () => configurePip(false), []);

  // Opened by a motion pop-up: shrink into a corner window so whatever was playing continues.
  const poppedUp = useRef(false);
  useEffect(() => {
    if (popup !== '1' || poppedUp.current) return;
    if (state.phase !== 'playing' && state.phase !== 'buffering') return;
    poppedUp.current = true;
    enterPip();
  }, [popup, state.phase]);

  const switchBy = useCallback(
    (delta: number) => {
      if (cameras.length < 2) return;
      setIndex((i) => stepIndex(i, delta, cameras.length));
      setSize(null);
      setZoom(NO_ZOOM);
      poke();
    },
    [cameras.length, poke],
  );

  // Remote number keys: jump straight to camera N.
  const digits = useDigitKeys(cameras.length, true, (n) => {
    setIndex(n - 1);
    setSize(null);
    setZoom(NO_ZOOM);
    poke();
  });

  const changeZoom = useCallback(
    (next: ZoomState) => {
      setZoom(next);
      poke();
    },
    [poke],
  );

  // Back while zoomed steps the zoom out instead of leaving the camera.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (zoomRef.current.zoom <= 1) return false;
      changeZoom(NO_ZOOM);
      return true;
    });
    return () => sub.remove();
  }, [changeZoom]);

  // Touch: pinch to zoom, drag to pan while zoomed. Taps still reach the Pressable.
  const gesture = useRef<{ start: ZoomState; startDist: number }>({ start: NO_ZOOM, startDist: 0 });
  // Created once; the handlers only read refs, and only inside touch events (never during
  // render) — the compiler can't see that through PanResponder.create.
  // eslint-disable-next-line react-hooks/refs
  const [panResponder] = useState(() =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (e, g) =>
          e.nativeEvent.touches.length === 2 || (zoomRef.current.zoom > 1 && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6)),
        onPanResponderGrant: (e) => {
          gesture.current = { start: zoomRef.current, startDist: touchDistance(e.nativeEvent.touches) };
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches.length === 2) {
            if (!gesture.current.startDist) gesture.current = { start: zoomRef.current, startDist: touchDistance(touches) };
            setZoom(pinchZoom(gesture.current.start, gesture.current.startDist, touchDistance(touches)));
          } else if (gesture.current.startDist === 0) {
            setZoom(dragPan(gesture.current.start, g.dx, g.dy, viewSize.current.width, viewSize.current.height));
          }
        },
      }),
  );

  const toggleSound = useCallback(() => {
    setMuted((m) => !m);
    poke();
  }, [poke]);

  useRemote((evt) => {
    // Zoomed: arrows pan the picture.
    if (zoomRef.current.zoom > 1) {
      const pan = { left: [-PAN_STEP, 0], right: [PAN_STEP, 0], up: [0, -PAN_STEP], down: [0, PAN_STEP] } as const;
      const d = pan[evt.eventType as keyof typeof pan];
      if (d) {
        changeZoom(panBy(zoomRef.current, d[0], d[1]));
        return;
      }
    }
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
        changeZoom(stepZoom(zoomRef.current, 1));
        break;
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
    } else if (isTV && zoom.zoom > 1) {
      changeZoom(stepZoom(zoom, 1));
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
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
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
          zoom={zoom.zoom}
          panX={zoom.x}
          panY={zoom.y}
        />
        <StreamOverlay state={state} />
      </Pressable>
      </View>

      {digits && !inPip ? (
        <View style={styles.digits} pointerEvents="none">
          <Text style={styles.digitsText}>{digits}</Text>
        </View>
      ) : null}

      {overlay && !inPip ? (
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
              {zoom.zoom > 1 ? (
                <View style={styles.zoomBadge}>
                  <Text style={styles.zoomText}>{Math.round(zoom.zoom * 10) / 10}×</Text>
                </View>
              ) : null}
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
              <Text style={styles.hint}>
                {zoom.zoom > 1
                  ? `Zoom ${zoom.zoom}× · arrows move · OK zoom in · BACK zoom out`
                  : `◀ ▶ switch camera · ▲ zoom · 1–9 camera · OK sound ${muted ? 'on' : 'off'} · BACK grid`}
              </Text>
            ) : (
              <View style={styles.controls}>
                <Button icon="chevron-left" onPress={() => switchBy(-1)} accessibilityLabel="Previous camera" />
                <Button
                  icon="magnify-minus-outline"
                  disabled={zoom.zoom <= 1}
                  onPress={() => changeZoom(stepZoom(zoom, -1))}
                  accessibilityLabel="Zoom out"
                />
                <Button icon={muted ? 'volume-off' : 'volume-high'} onPress={toggleSound} accessibilityLabel="Toggle sound" />
                <Button
                  icon="magnify-plus-outline"
                  disabled={zoom.zoom >= 4}
                  onPress={() => changeZoom(stepZoom(zoom, 1))}
                  accessibilityLabel="Zoom in"
                />
                <Button icon="chevron-right" onPress={() => switchBy(1)} accessibilityLabel="Next camera" />
              </View>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

function touchDistance(touches: readonly { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  if (!a || !b) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

const styles = StyleSheet.create({
  zoomBadge: { backgroundColor: colors.overlay, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  zoomText: { color: colors.teal, fontSize: type.label, fontWeight: '800' },
  digits: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    backgroundColor: colors.overlay,
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  digitsText: { color: colors.text, fontSize: 56, fontWeight: '800', letterSpacing: 4 },
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
