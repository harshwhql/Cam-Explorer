import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PtzCode } from '@/core/dahua';
import type { IconName } from '@/ui/controls';
import { colors, space, type } from '@/ui/theme';

/** Touch PTZ controls: press and hold to move, release to stop. */
export function PtzPad({
  zoom,
  moving,
  onStart,
  onStop,
  onClose,
}: {
  zoom: boolean;
  moving: PtzCode | null;
  onStart: (code: PtzCode) => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const key = (code: PtzCode, icon: IconName, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => onStart(code)}
      onPressOut={onStop}
      style={[styles.key, moving === code && styles.keyActive]}
    >
      <MaterialCommunityIcons name={icon} size={28} color={moving === code ? colors.bg : colors.text} />
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <View style={styles.cross}>
        <View style={styles.row}>{key('Up', 'chevron-up', 'Tilt up')}</View>
        <View style={styles.row}>
          {key('Left', 'chevron-left', 'Pan left')}
          <View style={styles.key} />
          {key('Right', 'chevron-right', 'Pan right')}
        </View>
        <View style={styles.row}>{key('Down', 'chevron-down', 'Tilt down')}</View>
      </View>
      <View style={styles.side}>
        {zoom ? key('ZoomTele', 'magnify-plus-outline', 'Zoom in') : null}
        {zoom ? key('ZoomWide', 'magnify-minus-outline', 'Zoom out') : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Close PTZ" onPress={onClose} style={styles.key}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const SIZE = 56;
const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: space.xl, padding: space.md },
  cross: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  side: { gap: space.sm },
  key: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  keyActive: { backgroundColor: colors.teal },
  done: { color: colors.text, fontSize: type.label, fontWeight: '700' },
});
