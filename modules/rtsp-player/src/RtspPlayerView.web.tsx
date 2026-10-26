import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { RtspPlayerViewProps } from './RtspPlayer.types';

/**
 * Browsers cannot play RTSP. This stand-in lets the UI be previewed on web:
 * it simulates connect → playing so layouts and overlays can be checked.
 */
export default function RtspPlayerView({ source, paused, onStatus, style }: RtspPlayerViewProps) {
  React.useEffect(() => {
    if (!source || paused) return;
    onStatus?.({ nativeEvent: { state: 'connecting' } });
    const t = setTimeout(() => onStatus?.({ nativeEvent: { state: 'playing' } }), 600);
    return () => clearTimeout(t);
  }, [source, paused, onStatus]);

  return (
    <View style={[styles.box, style]}>
      <Text style={styles.text}>{source ? 'RTSP preview (device only)' : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#111821',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#3a4a5c', fontSize: 12 },
});
