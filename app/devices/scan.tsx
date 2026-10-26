import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { parseProbeMatches, type DiscoveredDevice } from '@/core/onvif';
import { useAppStore } from '@/storage/store';
import { Screen } from '@/ui/Screen';
import { Banner, Button, ListRow, SectionTitle } from '@/ui/controls';
import { colors, space, type } from '@/ui/theme';
import { discoverOnvif, isNativePlayerAvailable } from 'rtsp-player';

export default function ScanScreen() {
  const devices = useAppStore((s) => s.devices);
  const [found, setFound] = useState<DiscoveredDevice[]>([]);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      setFound(parseProbeMatches(await discoverOnvif(3500)));
    } catch (e) {
      setError((e as Error).message ?? 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    discoverOnvif(3500)
      .then((r) => alive && setFound(parseProbeMatches(r)))
      .catch((e: Error) => alive && setError(e.message ?? 'Scan failed'))
      .finally(() => alive && setScanning(false));
    return () => {
      alive = false;
    };
  }, []);

  const known = new Set(devices.flatMap((d) => (d.kind === 'dahua' ? [d.host] : [])));

  return (
    <Screen title="Find devices" subtitle="Searching your local network (ONVIF)">
      <View style={styles.row}>
        <Button label={scanning ? 'Scanning…' : 'Scan again'} icon="radar" disabled={scanning} onPress={scan} />
        <Button label="Enter IP manually" icon="keyboard-outline" variant="ghost" onPress={() => router.replace('/devices/edit?kind=dahua')} />
        {scanning ? <ActivityIndicator color={colors.accent} /> : null}
      </View>

      {!isNativePlayerAvailable ? <Banner tone="info" text="Network discovery runs in the Android app only." /> : null}
      {error ? <Banner tone="danger" text={error} /> : null}

      <SectionTitle>{found.length ? `Found ${found.length}` : scanning ? 'Looking…' : 'Nothing found'}</SectionTitle>
      {found.map((d, i) => (
        <ListRow
          key={d.address}
          title={d.name ?? d.hardware ?? d.address}
          subtitle={`${d.address}${d.hardware && d.name ? ` · ${d.hardware}` : ''}${d.likelyDahua ? ' · CP Plus / Dahua' : ''}`}
          right={known.has(d.address) ? 'Added' : undefined}
          icon={d.likelyDahua ? 'cctv' : 'video-outline'}
          hasTVPreferredFocus={i === 0}
          onPress={() =>
            router.replace({
              pathname: '/devices/edit',
              params: {
                kind: d.likelyDahua ? 'dahua' : 'rtsp',
                host: d.address,
                httpPort: String(d.httpPort),
                name: d.name ?? '',
              },
            })
          }
        />
      ))}

      {!scanning && found.length === 0 ? (
        <Text style={styles.tip}>
          Not listed? Make sure this device and the recorder are on the same network and that ONVIF is enabled on the recorder
          (Main Menu → Network). You can always add it by IP address.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  tip: { color: colors.textDim, fontSize: type.body, lineHeight: 22 },
});
