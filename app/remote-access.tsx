import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/ui/Screen';
import { Banner, SectionTitle } from '@/ui/controls';
import { colors, radius, space, type } from '@/ui/theme';

const STEPS: { title: string; body: string }[] = [
  {
    title: '1. Never open ports on your router',
    body: 'Port-forwarding the recorder to the internet exposes it to constant attacks. CamExplorer warns you if a device uses a public address.',
  },
  {
    title: '2. Put a VPN node on your home network',
    body: 'Install Tailscale (free for personal use) on an always-on device at home — a PC, a Raspberry Pi or a router that supports it — and turn on "subnet routing" for your home network (for example 192.168.1.0/24). WireGuard on your router works too.',
  },
  {
    title: '3. Install the VPN app on your phone or tablet',
    body: 'Sign in to the same Tailscale account (or import your WireGuard profile) and approve the subnet route once.',
  },
  {
    title: '4. Use the recorder exactly as at home',
    body: 'With the VPN on, keep the recorder\'s normal home IP in CamExplorer — nothing else changes. Streams stay end-to-end encrypted by the VPN.',
  },
];

/** How to watch away from home safely (VPN), without exposing the recorder to the internet. */
export default function RemoteAccessScreen() {
  return (
    <Screen title="Viewing away from home" subtitle="Safely, through a VPN — no open ports">
      <Banner
        tone="info"
        icon="shield-lock-outline"
        text="CamExplorer only talks to your recorder directly. A VPN makes your home network reachable from your phone, encrypted, without putting the recorder on the internet."
      />
      <SectionTitle>Set it up once</SectionTitle>
      {STEPS.map((s) => (
        <View key={s.title} style={styles.card}>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
      <SectionTitle>Tips</SectionTitle>
      <View style={styles.card}>
        <Text style={styles.body}>• Use the sub stream in the grid on mobile data — it uses far less bandwidth.</Text>
        <Text style={styles.body}>• Tailscale addresses (100.x.y.z) and *.ts.net names are treated as private, so no warning is shown.</Text>
        <Text style={styles.body}>• Change the recorder&apos;s default password and keep its firmware up to date.</Text>
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
  title: { color: colors.text, fontSize: type.body, fontWeight: '700' },
  body: { color: colors.textDim, fontSize: type.label, lineHeight: 20 },
});
