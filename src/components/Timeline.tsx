import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DAY, formatClock, type Span } from '@/core/timeline';
import { colors, isTV, radius, space, type } from '@/ui/theme';

/**
 * 24 h recording timeline: recorded spans, motion markers and a cursor.
 * Focusable for TV (the screen handles the arrow keys); tap to seek on touch screens.
 */
export function Timeline({
  dayStart,
  spans,
  marks,
  cursor,
  onSeek,
  onFocusChange,
  onActivate,
  hasTVPreferredFocus,
}: {
  dayStart: number;
  spans: Span[];
  marks: number[];
  cursor: number;
  onSeek: (t: number) => void;
  onFocusChange?: (focused: boolean) => void;
  /** OK on a TV remote (no tap position). */
  onActivate?: () => void;
  hasTVPreferredFocus?: boolean;
}) {
  const [width, setWidth] = useState(1);
  const [focused, setFocused] = useState(false);
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - dayStart) / DAY) * 100))}%` as const;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel={`Timeline, ${formatClock(cursor)}`}
        hasTVPreferredFocus={hasTVPreferredFocus}
        onFocus={() => {
          setFocused(true);
          onFocusChange?.(true);
        }}
        onBlur={() => {
          setFocused(false);
          onFocusChange?.(false);
        }}
        onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        onPress={(e) => {
          const x = e.nativeEvent.locationX;
          if (isTV || typeof x !== 'number' || Number.isNaN(x)) onActivate?.();
          else onSeek(dayStart + (x / width) * DAY);
        }}
        style={[styles.bar, focused && styles.barFocused]}
      >
        {spans.map((s) => (
          <View
            key={s.start}
            pointerEvents="none"
            style={[styles.span, { left: pct(s.start), width: `${((s.end - s.start) / DAY) * 100}%` }]}
          />
        ))}
        {marks.map((t) => (
          <View key={t} pointerEvents="none" style={[styles.mark, { left: pct(t) }]} />
        ))}
        <View pointerEvents="none" style={[styles.cursor, { left: pct(cursor) }]} />
      </Pressable>
      <View style={styles.hours} pointerEvents="none">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <Text key={h} style={styles.hour}>
            {String(h % 24).padStart(2, '0')}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  bar: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  barFocused: { borderColor: colors.focus },
  span: { position: 'absolute', top: 10, bottom: 10, backgroundColor: colors.accent, opacity: 0.55 },
  mark: { position: 'absolute', top: 4, bottom: 4, width: 3, marginLeft: -1, backgroundColor: colors.warn },
  cursor: { position: 'absolute', top: 0, bottom: 0, width: 3, marginLeft: -1, backgroundColor: colors.focus },
  hours: { flexDirection: 'row', justifyContent: 'space-between' },
  hour: { color: colors.textFaint, fontSize: type.caption },
});
