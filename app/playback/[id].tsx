import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Timeline } from '@/components/Timeline';
import { DahuaClient, DahuaError } from '@/core/dahua';
import { buildDahuaPlaybackUrl } from '@/core/rtsp';
import {
  DAY,
  MINUTE,
  addDays,
  clamp,
  eventMarks,
  formatClock,
  jumpToEvent,
  mergeSpans,
  playableFrom,
  startOfDay,
  type Recording,
} from '@/core/timeline';
import { useAppActive, useNow } from '@/hooks/lifecycle';
import { useCameras } from '@/hooks/useCameras';
import { useRemote } from '@/hooks/useRemote';
import { cachedPassword } from '@/storage/secrets';
import { Screen } from '@/ui/Screen';
import { Banner, Button } from '@/ui/controls';
import { colors, isTV, radius, space, type } from '@/ui/theme';
import { PlayerView, isCompatEngineAvailable, type PlayerStatusEvent } from 'rtsp-player';

/** Resume playback this long after the last scrub key press (avoids a reconnect per press). */
const SCRUB_RESUME_MS = 800;
/** Each playback request covers up to this much footage; reaching the end just stops. */
const PLAY_WINDOW_MS = 3 * 60 * MINUTE;

interface DayData {
  day: number;
  recs: Recording[];
  error?: string;
}

export default function PlaybackScreen() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cameras, byDevice } = useCameras();
  const cam = cameras.find((c) => c.id === id);
  const device = cam ? byDevice.get(cam.deviceId) : undefined;
  const nvr = device?.kind === 'dahua' ? device : undefined;
  const appActive = useAppActive();

  const [day, setDay] = useState(() => startOfDay(Date.now()));
  const [data, setData] = useState<DayData | null>(null);
  const [cursor, setCursor] = useState(() => Date.now() - 5 * MINUTE);
  const [play, setPlay] = useState<{ from: number; at: number; key: number } | null>(null);
  const [status, setStatus] = useState<PlayerStatusEvent | null>(null);
  const [timelineFocused, setTimelineFocused] = useState(false);
  const now = useNow(1000, !!play);
  const playKey = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clock = useNow(30_000); // "now" for today's end of footage, without impure renders
  const isToday = day === startOfDay(clock);
  const dayEnd = isToday ? Math.min(day + DAY - 1000, clock) : day + DAY - 1000;
  const loading = !!nvr && data?.day !== day;

  // Search the recorder for the day's recordings.
  useEffect(() => {
    if (!nvr || !cam) return;
    let alive = true;
    const client = new DahuaClient({
      host: nvr.host,
      port: nvr.httpPort,
      username: nvr.username,
      password: cachedPassword(nvr.id) ?? '',
      timeoutMs: 10_000,
    });
    client
      .findRecordings(cam.channel, day, day + DAY - 1000)
      .then((recs) => alive && setData({ day, recs }))
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof DahuaError && e.code === 'auth' ? 'Wrong username or password' : 'Could not search recordings';
        setData({ day, recs: [], error: msg });
      });
    return () => {
      alive = false;
    };
  }, [nvr, cam, day]);

  useEffect(() => () => clearTimeout(resumeTimer.current), []);

  const recs = useMemo(() => (data?.day === day ? data.recs : []), [data, day]);
  const spans = useMemo(() => mergeSpans(recs, day, day + DAY), [recs, day]);
  const marks = useMemo(() => eventMarks(recs, day, day + DAY), [recs, day]);
  const position = play ? Math.min(play.from + (now - play.at), dayEnd) : cursor;

  const startAt = (t: number) => {
    const from = playableFrom(spans, clamp(t, day, dayEnd));
    setStatus(null);
    if (from === null) {
      setPlay(null);
      setStatus({ state: 'error', code: 'ended', message: 'No recording after this time' });
      return;
    }
    playKey.current += 1;
    setCursor(from);
    setPlay({ from, at: Date.now(), key: playKey.current });
  };

  const pause = () => {
    setCursor(position);
    setPlay(null);
  };

  /** Move the cursor; if playing, pause now and resume shortly after the last nudge. */
  const nudge = (deltaMs: number) => {
    const wasPlaying = !!play || !!resumeTimer.current;
    const target = clamp(position + deltaMs, day, dayEnd);
    setPlay(null);
    setCursor(target);
    clearTimeout(resumeTimer.current);
    resumeTimer.current = undefined;
    if (wasPlaying) {
      resumeTimer.current = setTimeout(() => {
        resumeTimer.current = undefined;
        startAt(target);
      }, SCRUB_RESUME_MS);
    }
  };

  const jumpEvent = (dir: 1 | -1) => {
    const t = jumpToEvent(marks, position, dir);
    if (t !== null) startAt(t);
  };

  const changeDay = (delta: number) => {
    const next = addDays(day, delta);
    if (next > startOfDay(Date.now())) return;
    setPlay(null);
    setStatus(null);
    setDay(next);
    setCursor(next === startOfDay(Date.now()) ? Date.now() - 5 * MINUTE : next + 12 * 60 * MINUTE);
  };

  useRemote((evt) => {
    if (evt.eventType === 'playPause' || evt.eventType === 'play' || evt.eventType === 'pause') {
      if (play) pause();
      else startAt(position);
      return;
    }
    if (evt.eventType === 'rewind') return jumpEvent(-1);
    if (evt.eventType === 'fastForward') return jumpEvent(1);
    if (!timelineFocused) return;
    if (evt.eventType === 'left') nudge(-MINUTE);
    else if (evt.eventType === 'right') nudge(MINUTE);
    else if (evt.eventType === 'channelDown') nudge(-10 * MINUTE);
    else if (evt.eventType === 'channelUp') nudge(10 * MINUTE);
  });

  if (!cam || !nvr) {
    return (
      <Screen title="Recordings">
        <Banner tone="info" text="Recordings are available for CP Plus / Dahua recorders." />
      </Screen>
    );
  }

  const source = play
    ? {
        uri: buildDahuaPlaybackUrl(nvr.host, nvr.rtspPort, cam.channel, play.from, Math.min(play.from + PLAY_WINDOW_MS, day + DAY - 1000)),
        username: nvr.username || undefined,
        password: cachedPassword(nvr.id),
        transport: nvr.transport,
        reloadKey: play.key,
      }
    : null;

  const dateLabel = new Date(day).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const statusText =
    status?.state === 'error'
      ? status.code === 'ended'
        ? status.message === 'No recording after this time'
          ? status.message
          : 'End of recording'
        : status.code === 'auth'
          ? 'Wrong username or password'
          : 'Could not play this recording'
      : play && status?.state !== 'playing'
        ? 'Loading…'
        : null;

  return (
    <Screen title={`${cam.name} · recordings`} subtitle={`${cam.deviceName} · ${dateLabel}`} scroll={false}>
      <View style={styles.header}>
        <Button icon="chevron-left" label={isTV ? 'Day' : undefined} compact onPress={() => changeDay(-1)} accessibilityLabel="Previous day" />
        <Button icon="chevron-right" label={isTV ? 'Day' : undefined} compact disabled={isToday} onPress={() => changeDay(1)} accessibilityLabel="Next day" />
        <Button icon="skip-previous" label={isTV ? 'Event' : undefined} compact disabled={!marks.length} onPress={() => jumpEvent(-1)} accessibilityLabel="Previous motion event" />
        <Button icon="skip-next" label={isTV ? 'Event' : undefined} compact disabled={!marks.length} onPress={() => jumpEvent(1)} accessibilityLabel="Next motion event" />
        <View style={styles.flex} />
        <Button icon="cctv" label="Live" compact variant="ghost" onPress={() => router.back()} />
      </View>

      <View style={styles.player}>
        <PlayerView
          engine={nvr.engine}
          compatAvailable={isCompatEngineAvailable}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          focusable={false}
          source={source}
          muted={false}
          audioEnabled
          paused={!appActive}
          resizeMode="contain"
          surfaceType="surface"
          stallTimeoutMs={15_000}
          onStatus={(e) => {
            setStatus(e.nativeEvent);
            if (e.nativeEvent.state === 'error') pause();
          }}
        />
        {!play ? (
          <View style={styles.center} pointerEvents="none">
            <Text style={styles.big}>{formatClock(position)}</Text>
            <Text style={styles.dim}>{isTV ? 'OK or ▶❚❚ to play' : 'Tap the timeline or ▶ to play'}</Text>
          </View>
        ) : null}
        {statusText ? (
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>{statusText}</Text>
          </View>
        ) : null}
        {play ? (
          <View style={styles.clock} pointerEvents="none">
            <Text style={styles.clockText}>{formatClock(position)}</Text>
          </View>
        ) : null}
      </View>

      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {data?.error ? <Banner tone="danger" text={data.error} /> : null}
      {!loading && !data?.error && spans.length === 0 ? <Banner tone="info" text="No recordings on this day." /> : null}

      <Timeline
        dayStart={day}
        spans={spans}
        marks={marks}
        cursor={position}
        hasTVPreferredFocus
        onFocusChange={setTimelineFocused}
        onSeek={(t) => startAt(t)}
        onActivate={() => (play ? pause() : startAt(position))}
      />
      <Text style={styles.hint}>
        {isTV
          ? '◀ ▶ 1 min · CH+/CH− 10 min · ⏪ ⏩ motion events · OK play/pause · ▲ day & events'
          : `${marks.length} motion event${marks.length === 1 ? '' : 's'} · orange marks on the timeline`}
      </Text>

      {!isTV ? (
        <View style={styles.controls}>
          <Button icon="rewind-10" onPress={() => nudge(-10 * MINUTE)} accessibilityLabel="Back 10 minutes" />
          <Button icon="step-backward" onPress={() => nudge(-MINUTE)} accessibilityLabel="Back 1 minute" />
          <Button icon={play ? 'pause' : 'play'} variant="primary" onPress={() => (play ? pause() : startAt(position))} accessibilityLabel={play ? 'Pause' : 'Play'} />
          <Button icon="step-forward" onPress={() => nudge(MINUTE)} accessibilityLabel="Forward 1 minute" />
          <Button icon="fast-forward-10" onPress={() => nudge(10 * MINUTE)} accessibilityLabel="Forward 10 minutes" />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  player: { width: '100%', flex: 1, minHeight: 180, backgroundColor: '#000', borderRadius: radius.md, overflow: 'hidden' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  big: { color: colors.text, fontSize: type.hero, fontWeight: '800' },
  dim: { color: colors.textDim, fontSize: type.label },
  badge: { position: 'absolute', top: space.sm, left: space.sm, backgroundColor: colors.overlay, borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 4 },
  badgeText: { color: colors.text, fontSize: type.label },
  clock: { position: 'absolute', bottom: space.sm, right: space.sm, backgroundColor: colors.overlay, borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 4 },
  clockText: { color: colors.text, fontSize: type.label, fontWeight: '700' },
  hint: { color: colors.textFaint, fontSize: type.caption, textAlign: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: space.md },
});
