import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PIN_MAX } from '@/core/pin';
import { Button, Icon } from '@/ui/controls';
import { colors, space, type } from '@/ui/theme';
import { addDigitListener } from 'rtsp-player';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'] as const;

/** Numeric PIN entry for touch and TV remotes (D-pad keypad or the remote's number keys). */
export function PinPad({
  title,
  subtitle,
  error,
  disabled,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  error?: string | null;
  disabled?: boolean;
  onSubmit: (pin: string) => void;
}) {
  const [pin, setPin] = useState('');
  const pinRef = useRef(pin);
  const submit = useRef(onSubmit);
  useEffect(() => {
    pinRef.current = pin;
    submit.current = onSubmit;
  });

  const press = (k: (typeof KEYS)[number]) => {
    if (disabled) return;
    if (k === 'del') setPin((p) => p.slice(0, -1));
    else if (k === 'ok') {
      if (pinRef.current) submit.current(pinRef.current);
      setPin('');
    } else setPin((p) => (p.length < PIN_MAX ? p + k : p));
  };

  // Remote number keys type directly.
  useEffect(
    () =>
      addDigitListener((d) => {
        if (!disabled) setPin((p) => (p.length < PIN_MAX ? p + String(d) : p));
      }),
    [disabled],
  );

  return (
    <View style={styles.root}>
      <Icon name="lock-outline" size={36} color={colors.accent} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.dots} accessibilityLabel={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotOn]} />
        ))}
      </View>
      <Text style={styles.error}>{error ?? ' '}</Text>
      <View style={styles.pad}>
        {KEYS.map((k, i) => (
          <Button
            key={k}
            testID={`pin-${k}`}
            label={k === 'del' || k === 'ok' ? undefined : k}
            icon={k === 'del' ? 'backspace-outline' : k === 'ok' ? 'check' : undefined}
            variant={k === 'ok' ? 'primary' : 'secondary'}
            disabled={disabled}
            hasTVPreferredFocus={i === 0}
            accessibilityLabel={k === 'del' ? 'Delete' : k === 'ok' ? 'Confirm' : k}
            onPress={() => press(k)}
            style={styles.key}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: type.title, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: colors.textDim, fontSize: type.body, textAlign: 'center', maxWidth: 420 },
  dots: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.textDim },
  dotOn: { backgroundColor: colors.text, borderColor: colors.text },
  error: { color: colors.danger, fontSize: type.label, minHeight: 18, textAlign: 'center' },
  pad: { width: 252, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  key: { width: 76, height: 56 },
});
