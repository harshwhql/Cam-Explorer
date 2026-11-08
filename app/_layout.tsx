import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import NetInfo from '@react-native-community/netinfo';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { redact } from '@/core/rtsp';
import { useAppActive } from '@/hooks/lifecycle';
import { useMotionPopup } from '@/hooks/useMotionPopup';
import { useMotionWatcher } from '@/hooks/useMotionWatcher';
import { RELOCK_AFTER_MS } from '@/core/pin';
import { usePinStore } from '@/storage/pinStore';
import { useAppStore } from '@/storage/store';
import { Button } from '@/ui/controls';
import { colors, space, type } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const hydrated = useAppStore((s) => s.hydrated);
  // Icons must be ready before first paint; a font error must never block the app.
  const [fontsLoaded, fontError] = useFonts(MaterialCommunityIcons.font);
  const pinLoaded = usePinStore((s) => s.loaded);
  const ready = hydrated && pinLoaded && (fontsLoaded || !!fontError);
  const hydrate = useAppStore((s) => s.hydrate);
  const setOnline = useAppStore((s) => s.setOnline);
  const motionAware = useAppStore((s) => s.settings.motionAware);
  const appActive = useAppActive();
  useMotionWatcher(hydrated && appActive && motionAware);
  useMotionPopup(ready);

  useEffect(() => {
    hydrate();
    usePinStore.getState().load();
  }, [hydrate]);

  // Re-lock (when a PIN is set) after the app has been away for a while.
  const awaySince = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') awaySince.current = Date.now();
      else if (s === 'active' && awaySince.current !== null) {
        if (Date.now() - awaySince.current > RELOCK_AFTER_MS) usePinStore.getState().lock();
        awaySince.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        // isInternetReachable is irrelevant for a LAN-only app; only the link matters.
        setOnline(s.isConnected !== false);
      }),
    [setOnline],
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        {ready ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="camera/[id]" options={{ animation: 'fade' }} />
          </Stack>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  crash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xxl },
  crashTitle: { color: colors.text, fontSize: type.title, fontWeight: '700' },
  crashBody: { color: colors.textDim, fontSize: type.body, textAlign: 'center', maxWidth: 560 },
});

/** Any render crash shows a recoverable screen instead of a blank screen. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={styles.crash}>
      <Text style={styles.crashTitle}>Something went wrong</Text>
      <Text style={styles.crashBody}>{redact(error?.message ?? 'Unknown error').slice(0, 300)}</Text>
      <Button label="Try again" icon="refresh" variant="primary" hasTVPreferredFocus onPress={() => retry()} />
    </View>
  );
}
