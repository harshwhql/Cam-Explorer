import { router } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/ui/controls';
import { colors, space, type } from '@/ui/theme';

export function EmptyState() {
  return (
    <View style={styles.root}>
      <Image source={require('../../assets/splash.png')} style={styles.logo} />
      <Text style={styles.title}>
        Welcome to Cam<Text style={{ color: colors.teal }}>Explorer</Text>
      </Text>
      <Text style={styles.body}>
        Add your CP Plus / Dahua recorder to watch every camera live. Everything stays on your home network —
        no cloud, no account.
      </Text>
      <View style={styles.actions}>
        <Button
          label="Find on my network"
          icon="radar"
          variant="primary"
          hasTVPreferredFocus
          onPress={() => router.push('/devices/scan')}
        />
        <Button label="Add CP Plus / Dahua" icon="cctv" onPress={() => router.push('/devices/edit?kind=dahua')} />
        <Button label="Add RTSP camera" icon="link-variant" onPress={() => router.push('/devices/edit?kind=rtsp')} />
      </View>
      <Button label="Settings" icon="cog-outline" variant="ghost" compact onPress={() => router.push('/settings')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    gap: space.lg,
  },
  logo: { width: 112, height: 112 },
  title: { color: colors.text, fontSize: type.hero, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.textDim, fontSize: type.body, textAlign: 'center', maxWidth: 520, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.md, marginTop: space.md },
});
