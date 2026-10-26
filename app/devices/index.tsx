import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { parseRtspUrl } from '@/core/rtsp';
import type { Device } from '@/core/types';
import { isPrivateAddress } from '@/core/validation';
import { useAppStore } from '@/storage/store';
import { Screen } from '@/ui/Screen';
import { Banner, Button, ListRow, SectionTitle } from '@/ui/controls';
import { colors, space, type } from '@/ui/theme';

function hostOf(d: Device): string {
  if (d.kind === 'dahua') return d.host;
  try {
    return parseRtspUrl(d.mainUrl).host;
  } catch {
    return '';
  }
}

function describe(d: Device): { subtitle: string; right: string } {
  if (d.kind === 'dahua') {
    const on = d.channels.filter((c) => c.enabled).length;
    return { subtitle: `CP Plus / Dahua · ${d.host}`, right: `${on}/${d.channels.length} cameras` };
  }
  return { subtitle: `RTSP · ${hostOf(d)}`, right: '1 camera' };
}

export default function DevicesScreen() {
  const devices = useAppStore((s) => s.devices);
  const exposed = devices.filter((d) => {
    const h = hostOf(d);
    return h && !isPrivateAddress(h);
  });

  return (
    <Screen title="Devices" subtitle="Recorders and cameras on your network">
      <View style={styles.actions}>
        <Button
          label="Find on network"
          icon="radar"
          variant="primary"
          hasTVPreferredFocus={devices.length === 0}
          onPress={() => router.push('/devices/scan')}
        />
        <Button label="Add CP Plus / Dahua" icon="plus" onPress={() => router.push('/devices/edit?kind=dahua')} />
        <Button label="Add RTSP URL" icon="link-variant" onPress={() => router.push('/devices/edit?kind=rtsp')} />
      </View>

      {exposed.length > 0 ? (
        <Banner
          tone="danger"
          icon="shield-alert-outline"
          text={`${exposed.map((d) => d.name).join(', ')} use a public internet address. An NVR exposed to the internet is a serious security risk — prefer a VPN such as Tailscale or WireGuard.`}
        />
      ) : null}

      <SectionTitle>Your devices</SectionTitle>
      {devices.length === 0 ? (
        <Text style={styles.empty}>No devices yet. Use “Find on network” or add your recorder by IP address.</Text>
      ) : (
        devices.map((d, i) => {
          const { subtitle, right } = describe(d);
          return (
            <ListRow
              key={d.id}
              testID={`device-${d.id}`}
              title={d.name}
              subtitle={subtitle}
              right={right}
              icon={d.kind === 'dahua' ? 'cctv' : 'video-outline'}
              hasTVPreferredFocus={i === 0}
              onPress={() => router.push({ pathname: '/devices/edit', params: { id: d.id } })}
            />
          );
        })
      )}

      <View style={styles.note}>
        <Banner
          tone="info"
          icon="lock-outline"
          text="Passwords are encrypted with the Android Keystore and are only ever sent to your own recorder. Nothing leaves your home network."
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  empty: { color: colors.textDim, fontSize: type.body },
  note: { marginTop: space.lg },
});
