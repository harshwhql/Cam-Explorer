import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/core/backoff';
import type { StreamState } from '@/core/streamState';
import { useNow } from '@/hooks/lifecycle';
import { Icon } from '@/ui/controls';
import { colors, fill, radius, space, type } from '@/ui/theme';

export function LivePill({ state }: { state: StreamState }) {
  if (state.phase !== 'playing' && state.phase !== 'buffering') return null;
  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: state.phase === 'playing' ? colors.live : colors.warn }]} />
      <Text style={styles.pillText}>{state.phase === 'playing' ? 'LIVE' : 'BUFFERING'}</Text>
    </View>
  );
}

/** Centre overlay for anything that is not live video. */
export function StreamOverlay({ state, compact }: { state: StreamState; compact?: boolean }) {
  const now = useNow(1000, state.phase === 'retrying');
  const { phase } = state;
  if (phase === 'playing' || phase === 'buffering' || phase === 'paused') return null;

  const iconSize = compact ? 22 : 34;
  let content: React.ReactNode;
  // Decoder hand-off between tiles is expected to fail once or twice — show it as connecting.
  const handoff = state.errorCode === 'decoder' && phase === 'retrying' && state.attempt < 2;
  if (phase === 'connecting' || phase === 'idle' || handoff) {
    content = (
      <>
        <ActivityIndicator color={colors.textDim} size={compact ? 'small' : 'large'} />
        <Text style={[styles.msg, compact && styles.msgCompact]}>Connecting…</Text>
      </>
    );
  } else {
    const code = state.errorCode ?? 'unknown';
    const secs = state.retryAt ? Math.max(0, Math.ceil((state.retryAt - now) / 1000)) : 0;
    const isAuth = code === 'auth';
    content = (
      <>
        <Icon
          name={isAuth ? 'lock-alert-outline' : code === 'network' ? 'wifi-off' : 'video-off-outline'}
          size={iconSize}
          color={isAuth ? colors.danger : colors.warn}
        />
        <Text style={[styles.msg, compact && styles.msgCompact]}>{describeError(code)}</Text>
        <Text style={[styles.sub, compact && styles.subCompact]}>
          {phase === 'retrying'
            ? `Retrying in ${secs}s · OK to retry now`
            : isAuth
              ? 'Press OK to fix the password'
              : 'Press OK to retry'}
        </Text>
      </>
    );
  }
  return <View style={styles.overlay}>{content}</View>;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.overlay,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { color: colors.text, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  overlay: {
    ...fill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: 'rgba(7,9,13,0.55)',
    padding: space.sm,
  },
  msg: { color: colors.text, fontSize: type.body, fontWeight: '600', textAlign: 'center' },
  msgCompact: { fontSize: type.label },
  sub: { color: colors.textDim, fontSize: type.label, textAlign: 'center' },
  subCompact: { fontSize: type.caption },
});
