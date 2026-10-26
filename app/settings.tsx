import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { StreamQuality } from '@/core/types';
import { useAppStore } from '@/storage/store';
import { Screen } from '@/ui/Screen';
import { Button, SectionTitle, Segmented, Stepper, ToggleRow } from '@/ui/controls';
import { colors, radius, space, type } from '@/ui/theme';
import { getDecoderCapabilities, type DecoderInfo } from 'rtsp-player';

function decoderLine(label: string, d: DecoderInfo | null | undefined): string {
  if (!d) return `${label}: not available`;
  const res = d.maxWidth && d.maxHeight ? `, up to ${d.maxWidth}×${d.maxHeight}` : '';
  return `${label}: ${d.hardware ? 'hardware' : 'software'}, ${d.maxInstances} streams${res}`;
}

export default function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const resetAll = useAppStore((s) => s.resetAll);
  const caps = useMemo(() => getDecoderCapabilities(), []);

  const qualityOptions: { value: StreamQuality; label: string }[] = [
    { value: 'sub', label: 'Sub stream (light)' },
    { value: 'main', label: 'Main stream (sharp)' },
  ];

  const confirmReset = () =>
    Alert.alert('Remove everything?', 'All devices, saved passwords and settings will be deleted from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove all',
        style: 'destructive',
        onPress: async () => {
          await resetAll();
          router.dismissAll();
        },
      },
    ]);

  return (
    <Screen title="Settings">
      <SectionTitle>Video</SectionTitle>
      <Segmented label="Grid quality" value={settings.gridQuality} options={qualityOptions} onChange={(v) => update({ gridQuality: v })} />
      <Segmented
        label="Full screen quality"
        value={settings.fullscreenQuality}
        options={qualityOptions}
        onChange={(v) => update({ fullscreenQuality: v })}
      />
      <ToggleRow label="Show camera names" value={settings.showLabels} onChange={(v) => update({ showLabels: v })} />
      <Stepper
        label="Reconnect a frozen stream after"
        value={settings.stallTimeoutSec}
        min={3}
        max={60}
        suffix="s"
        onChange={(v) => update({ stallTimeoutSec: v })}
      />

      <SectionTitle>Tour</SectionTitle>
      <ToggleRow
        label="Tour mode"
        description="Automatically cycle through pages of cameras when nobody touches the remote"
        value={settings.tourEnabled}
        onChange={(v) => update({ tourEnabled: v })}
      />
      {settings.tourEnabled ? (
        <Stepper
          label="Show each page for"
          value={settings.tourIntervalSec}
          min={5}
          max={300}
          step={5}
          suffix="s"
          onChange={(v) => update({ tourIntervalSec: v })}
        />
      ) : null}

      <SectionTitle>This device</SectionTitle>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {caps?.manufacturer ?? 'Unknown'} {caps?.model ?? ''}
        </Text>
        <Text style={styles.cardLine}>{decoderLine('H.264', caps?.h264)}</Text>
        <Text style={styles.cardLine}>{decoderLine('H.265', caps?.h265)}</Text>
      </View>

      <SectionTitle>Privacy & security</SectionTitle>
      <View style={styles.card}>
        <Text style={styles.cardLine}>• Works only on your local network. No cloud, no account, no analytics.</Text>
        <Text style={styles.cardLine}>• Passwords are encrypted with the Android Keystore and never shown or logged.</Text>
        <Text style={styles.cardLine}>• Recorder logins use Digest authentication; plain-text Basic logins are refused.</Text>
        <Text style={styles.cardLine}>• A wrong password is never retried automatically, so your recorder won’t lock the account.</Text>
        <Text style={styles.cardLine}>• Nothing is included in Android cloud backups.</Text>
      </View>

      <SectionTitle>About</SectionTitle>
      <Text style={styles.cardLine}>CamExplorer {Constants.expoConfig?.version ?? ''}</Text>

      <View style={styles.danger}>
        <Button label="Remove all devices and settings" icon="trash-can-outline" variant="danger" onPress={confirmReset} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs,
  },
  cardTitle: { color: colors.text, fontSize: type.body, fontWeight: '700', marginBottom: space.xs },
  cardLine: { color: colors.textDim, fontSize: type.label, lineHeight: 20 },
  danger: { marginTop: space.xl, alignItems: 'flex-start' },
});
