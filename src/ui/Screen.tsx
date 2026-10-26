import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './controls';
import { colors, isTV, space, tvSafe, type } from './theme';

export function Screen({
  title,
  subtitle,
  children,
  actions,
  scroll = true,
  showBack = !isTV,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  scroll?: boolean;
  showBack?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: Math.max(insets.top, tvSafe.vertical),
    paddingLeft: Math.max(insets.left, tvSafe.horizontal),
    paddingRight: Math.max(insets.right, tvSafe.horizontal),
  };
  const body = (
    <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, tvSafe.vertical) + space.lg }]}>
      {children}
    </View>
  );
  return (
    <View style={[styles.root, pad]}>
      <View style={styles.header}>
        {showBack && router.canGoBack() ? (
          <Button icon="arrow-left" variant="ghost" compact onPress={() => router.back()} accessibilityLabel="Back" />
        ) : null}
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {scroll ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.lg,
    maxWidth: 880,
    width: '100%',
    alignSelf: 'center',
  },
  titleWrap: { flex: 1 },
  title: { color: colors.text, fontSize: type.title, fontWeight: '700' },
  subtitle: { color: colors.textDim, fontSize: type.label, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space.sm },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { gap: space.md, maxWidth: 880, width: '100%', alignSelf: 'center' },
});
