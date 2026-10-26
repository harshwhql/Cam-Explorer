import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { StreamOverlay } from '@/components/StreamStatus';
import { DahuaClient, DahuaError } from '@/core/dahua';
import { buildDahuaUrl, parseRtspUrl } from '@/core/rtsp';
import { newDeviceId } from '@/core/schema';
import type { ChannelConfig, Device, Transport } from '@/core/types';
import {
  isPrivateAddress,
  validateChannelCount,
  validateHost,
  validatePassword,
  validatePort,
  validateUsername,
} from '@/core/validation';
import { useStream } from '@/hooks/useStream';
import { cachedPassword } from '@/storage/secrets';
import { useAppStore } from '@/storage/store';
import { Screen } from '@/ui/Screen';
import { Banner, Button, SectionTitle, Segmented, Stepper, TextField, ToggleRow } from '@/ui/controls';
import { colors, radius, space, type } from '@/ui/theme';
import { RtspPlayerView } from 'rtsp-player';

type Kind = Device['kind'];
type Detect = { state: 'idle' | 'working' | 'ok' | 'error'; message?: string };

function defaultChannels(
  count: number,
  names: string[] = [],
  previous: ChannelConfig[] = [],
  videoLoss: number[] = [],
): ChannelConfig[] {
  return Array.from({ length: count }, (_, i) => {
    const number = i + 1;
    const prev = previous.find((c) => c.number === number);
    const fromRecorder = names[i]?.trim();
    // Channels with no video signal start hidden; the user can still switch them on.
    const enabled = videoLoss.includes(number) ? false : (prev?.enabled ?? true);
    return { number, name: fromRecorder || prev?.name || `Camera ${number}`, enabled };
  });
}

export default function EditDeviceScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: string; host?: string; httpPort?: string; name?: string }>();
  const devices = useAppStore((s) => s.devices);
  const saveDevice = useAppStore((s) => s.saveDevice);
  const removeDevice = useAppStore((s) => s.removeDevice);
  const existing = useMemo(() => devices.find((d) => d.id === params.id), [devices, params.id]);
  const isNew = !existing;

  const [kind, setKind] = useState<Kind>(existing?.kind ?? (params.kind === 'rtsp' ? 'rtsp' : 'dahua'));
  const [name, setName] = useState(existing?.name ?? params.name ?? '');
  const [host, setHost] = useState(existing?.kind === 'dahua' ? existing.host : (params.host ?? ''));
  const [rtspPort, setRtspPort] = useState(String(existing?.kind === 'dahua' ? existing.rtspPort : 554));
  const [httpPort, setHttpPort] = useState(String(existing?.kind === 'dahua' ? existing.httpPort : (params.httpPort ?? 80)));
  const [username, setUsername] = useState(existing?.username ?? 'admin');
  const [password, setPassword] = useState('');
  const [passwordEdited, setPasswordEdited] = useState(isNew);
  const [transport, setTransport] = useState<Transport>(existing?.transport ?? 'tcp');
  const [channels, setChannels] = useState<ChannelConfig[]>(existing?.kind === 'dahua' ? existing.channels : []);
  const [manualCount, setManualCount] = useState(existing?.kind === 'dahua' ? existing.channels.length : 4);
  const [mainUrl, setMainUrl] = useState(existing?.kind === 'rtsp' ? existing.mainUrl : params.host ? `rtsp://${params.host}:554/` : '');
  const [subUrl, setSubUrl] = useState(existing?.kind === 'rtsp' ? (existing.subUrl ?? '') : '');
  const [detect, setDetect] = useState<Detect>({ state: 'idle' });
  const [deviceType, setDeviceType] = useState<string | undefined>();
  const [editNames, setEditNames] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const effectivePassword = passwordEdited ? password : (existing ? (cachedPassword(existing.id) ?? '') : '');
  const effectiveChannels = channels.length ? channels : defaultChannels(manualCount);

  // Pasted URLs with credentials: move them into the encrypted fields.
  const absorbUrlCredentials = (value: string, which: 'main' | 'sub') => {
    try {
      const p = parseRtspUrl(value);
      if (p.username !== undefined) {
        setUsername(p.username);
        if (p.password !== undefined) {
          setPassword(p.password);
          setPasswordEdited(true);
        }
        (which === 'main' ? setMainUrl : setSubUrl)(p.url);
      }
    } catch {
      // validated on save
    }
  };

  const runDetect = async () => {
    const hostErr = validateHost(host);
    const portErr = validatePort(httpPort);
    const userErr = validateUsername(username);
    setErrors({ host: hostErr, httpPort: portErr, username: userErr });
    if (hostErr || portErr || userErr) return;
    setDetect({ state: 'working' });
    try {
      const client = new DahuaClient({
        host: host.trim(),
        port: Number(httpPort),
        username,
        password: effectivePassword,
      });
      const res = await client.probe();
      setDeviceType(res.deviceType);
      const count = res.channelCount ?? manualCount;
      setManualCount(count);
      setChannels(defaultChannels(count, res.channelNames, channels, res.videoLossChannels));
      if (!name.trim() && res.deviceType) setName(res.deviceType);
      setDetect({
        state: 'ok',
        message:
          `Found ${res.deviceType ?? 'recorder'} with ${count} channel${count === 1 ? '' : 's'}` +
          (res.videoLossChannels.length
            ? ` — no signal on ${res.videoLossChannels.map((n) => `CH${n}`).join(', ')}, hidden (switch on below if needed)`
            : ''),
      });
    } catch (e) {
      const err = e as DahuaError;
      const msg =
        err.code === 'auth'
          ? 'Wrong username or password. Careful: CP Plus recorders lock the account after about 5 wrong attempts.'
          : err.code === 'insecure_auth'
            ? err.message
            : `${err.message ?? 'Detection failed'}. You can still set the number of channels below.`;
      setDetect({ state: 'error', message: msg });
    }
  };

  const buildDevice = (): Device | null => {
    const e: Record<string, string | null> = {
      name: name.trim() ? null : 'Give it a name, e.g. "Home NVR"',
      username: username ? validateUsername(username) : null,
      password: validatePassword(effectivePassword),
    };
    const base = {
      id: existing?.id ?? newDeviceId(),
      name: name.trim().slice(0, 64),
      username,
      transport,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    let device: Device | null = null;
    if (kind === 'dahua') {
      e.host = validateHost(host);
      e.rtspPort = validatePort(rtspPort);
      e.httpPort = validatePort(httpPort);
      e.channels = validateChannelCount(effectiveChannels.length);
      if (!effectiveChannels.some((c) => c.enabled)) e.channels = 'Enable at least one camera';
      device = {
        ...base,
        kind: 'dahua',
        host: host.trim(),
        rtspPort: Number(rtspPort),
        httpPort: Number(httpPort),
        channels: effectiveChannels,
      };
    } else {
      try {
        const main = parseRtspUrl(mainUrl);
        const sub = subUrl.trim() ? parseRtspUrl(subUrl) : undefined;
        device = { ...base, kind: 'rtsp', mainUrl: main.url, subUrl: sub?.url };
      } catch (err) {
        e.mainUrl = (err as Error).message;
      }
    }
    setErrors(e);
    return Object.values(e).some(Boolean) ? null : device;
  };

  const onSave = async () => {
    const device = buildDevice();
    if (!device) return;
    setSaving(true);
    try {
      await saveDevice(device, passwordEdited ? password : undefined);
      router.back();
    } catch (err) {
      Alert.alert('Could not save', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert('Remove device?', `${existing.name} and its saved password will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeDevice(existing.id);
          router.back();
        },
      },
    ]);
  };

  // Live test of the first enabled channel / main URL.
  const previewSource = useMemo(() => {
    if (!preview) return null;
    try {
      if (kind === 'dahua') {
        const ch = effectiveChannels.find((c) => c.enabled)?.number ?? 1;
        return {
          uri: buildDahuaUrl(host.trim(), Number(rtspPort), ch, 'sub'),
          username,
          password: effectivePassword,
          transport,
        };
      }
      return { uri: parseRtspUrl(mainUrl).url, username: username || undefined, password: effectivePassword, transport };
    } catch {
      return null;
    }
  }, [preview, kind, host, rtspPort, username, effectivePassword, transport, mainUrl, effectiveChannels]);
  const stream = useStream(previewSource, preview);

  const publicHost = kind === 'dahua' && host.trim() && !validateHost(host) && !isPrivateAddress(host);

  return (
    <Screen
      title={isNew ? 'Add device' : `Edit ${existing?.name}`}
      subtitle={kind === 'dahua' ? 'CP Plus / Dahua NVR, DVR or camera' : 'Any camera with an RTSP URL'}
    >
      {isNew ? (
        <Segmented<Kind>
          label="Type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'dahua', label: 'CP Plus / Dahua', icon: 'cctv' },
            { value: 'rtsp', label: 'RTSP URL', icon: 'link-variant' },
          ]}
        />
      ) : null}

      <TextField label="Name" value={name} onChangeText={setName} placeholder="Home NVR" error={errors.name} maxLength={64} />

      {kind === 'dahua' ? (
        <>
          <TextField
            label="IP address"
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.108"
            keyboardType="url"
            error={errors.host}
            hint="Find it on the recorder: Main Menu → Network → TCP/IP"
          />
          <View style={styles.row}>
            <TextField style={styles.flex} label="RTSP port" value={rtspPort} onChangeText={setRtspPort} keyboardType="number-pad" error={errors.rtspPort} maxLength={5} />
            <TextField style={styles.flex} label="HTTP port" value={httpPort} onChangeText={setHttpPort} keyboardType="number-pad" error={errors.httpPort} maxLength={5} />
          </View>
        </>
      ) : (
        <>
          <TextField
            label="Main stream URL"
            value={mainUrl}
            onChangeText={setMainUrl}
            onBlur={() => absorbUrlCredentials(mainUrl, 'main')}
            placeholder="rtsp://192.168.1.50:554/stream1"
            keyboardType="url"
            error={errors.mainUrl}
            hint="Credentials in the URL are moved into the encrypted password field automatically"
          />
          <TextField
            label="Sub stream URL (optional, used in the grid)"
            value={subUrl}
            onChangeText={setSubUrl}
            onBlur={() => absorbUrlCredentials(subUrl, 'sub')}
            placeholder="rtsp://192.168.1.50:554/stream2"
            keyboardType="url"
          />
        </>
      )}

      <View style={styles.row}>
        <TextField style={styles.flex} label="Username" value={username} onChangeText={setUsername} error={errors.username} maxLength={64} />
        <TextField
          style={styles.flex}
          label="Password"
          value={passwordEdited ? password : ''}
          onChangeText={(t) => {
            setPassword(t);
            setPasswordEdited(true);
          }}
          placeholder={!passwordEdited ? '•••••••• (unchanged)' : ''}
          secureTextEntry
          error={errors.password}
          maxLength={128}
        />
      </View>

      {publicHost ? (
        <Banner
          tone="danger"
          icon="shield-alert-outline"
          text="This is a public internet address. Exposing an NVR to the internet is risky — use it on your home network or through a VPN."
        />
      ) : null}

      {kind === 'dahua' ? (
        <>
          <SectionTitle>Cameras</SectionTitle>
          <View style={styles.row}>
            <Button
              label={detect.state === 'working' ? 'Detecting…' : 'Test & detect cameras'}
              icon="magnify-scan"
              variant="primary"
              disabled={detect.state === 'working'}
              onPress={runDetect}
            />
            {detect.state === 'working' ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
          {detect.message ? (
            <Banner tone={detect.state === 'ok' ? 'info' : 'warn'} icon={detect.state === 'ok' ? 'check-circle-outline' : undefined} text={detect.message} />
          ) : null}
          {deviceType ? <Text style={styles.meta}>Model: {deviceType}</Text> : null}

          {channels.length === 0 ? (
            <Stepper label="Number of channels" value={manualCount} min={1} max={64} onChange={setManualCount} />
          ) : null}
          {errors.channels ? <Text style={styles.error}>{errors.channels}</Text> : null}

          <ToggleRow label="Edit camera names" value={editNames} onChange={setEditNames} />
          {effectiveChannels.map((c, i) =>
            editNames ? (
              <TextField
                key={c.number}
                label={`Channel ${c.number}`}
                value={c.name}
                maxLength={64}
                onChangeText={(t) => {
                  const next = [...effectiveChannels];
                  next[i] = { ...c, name: t };
                  setChannels(next);
                }}
              />
            ) : (
              <ToggleRow
                key={c.number}
                label={c.name}
                description={`Channel ${c.number}${c.enabled ? '' : ' · hidden'}`}
                value={c.enabled}
                onChange={(v) => {
                  const next = [...effectiveChannels];
                  next[i] = { ...c, enabled: v };
                  setChannels(next);
                }}
              />
            ),
          )}
        </>
      ) : null}

      <SectionTitle>Connection</SectionTitle>
      <Segmented<Transport>
        label="Transport"
        value={transport}
        onChange={setTransport}
        options={[
          { value: 'tcp', label: 'TCP (stable, recommended)' },
          { value: 'udp', label: 'UDP (lower latency)' },
        ]}
      />

      <View style={styles.row}>
        <Button label={preview ? 'Stop test' : 'Test live stream'} icon="play-circle-outline" onPress={() => setPreview((p) => !p)} />
      </View>
      {preview ? (
        <View style={styles.preview}>
          <RtspPlayerView
            style={StyleSheet.absoluteFill}
            source={stream.nativeSource}
            muted
            paused={false}
            resizeMode="contain"
            surfaceType="texture"
            onStatus={stream.onStatus}
          />
          <StreamOverlay state={stream.state} />
        </View>
      ) : null}

      <View style={[styles.row, styles.footer]}>
        <Button label={saving ? 'Saving…' : 'Save'} icon="content-save-outline" variant="primary" disabled={saving} onPress={onSave} />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        {!isNew ? <Button label="Remove" icon="trash-can-outline" variant="danger" onPress={onDelete} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 160 },
  meta: { color: colors.textDim, fontSize: type.label },
  error: { color: colors.danger, fontSize: type.label },
  preview: {
    width: '100%',
    maxWidth: 560,
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  footer: { marginTop: space.lg },
});
