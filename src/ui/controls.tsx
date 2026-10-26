import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Focusable } from './Focusable';
import { colors, radius, space, type } from './theme';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label?: string;
  icon?: IconName;
  onPress?: () => void;
  variant?: Variant;
  compact?: boolean;
  disabled?: boolean;
  selected?: boolean;
  hasTVPreferredFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  onFocus?: () => void;
}

export function Button({
  label,
  icon,
  onPress,
  variant = 'secondary',
  compact,
  disabled,
  selected,
  hasTVPreferredFocus,
  style,
  testID,
  accessibilityLabel,
  onFocus,
}: ButtonProps) {
  return (
    <Focusable
      testID={testID}
      onFocus={onFocus}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={(focused) => [
        styles.btn,
        compact && styles.btnCompact,
        !label && styles.btnIconOnly,
        variantStyle(variant, selected),
        focused && styles.btnFocused,
        disabled && styles.disabled,
        style,
      ]}
    >
      {(focused) => (
        <>
          {icon ? <Icon name={icon} size={compact ? 18 : 20} color={textColor(variant, focused, selected)} /> : null}
          {label ? (
            <Text
              numberOfLines={1}
              style={[styles.btnText, compact && styles.btnTextCompact, { color: textColor(variant, focused, selected) }]}
            >
              {label}
            </Text>
          ) : null}
        </>
      )}
    </Focusable>
  );
}

function variantStyle(v: Variant, selected?: boolean): ViewStyle {
  if (selected) return { backgroundColor: colors.accentSoft, borderColor: colors.accent };
  switch (v) {
    case 'primary':
      return { backgroundColor: colors.accent, borderColor: colors.accent };
    case 'danger':
      return { backgroundColor: 'rgba(255,92,108,0.12)', borderColor: 'rgba(255,92,108,0.4)' };
    case 'ghost':
      return { backgroundColor: 'transparent', borderColor: 'transparent' };
    default:
      return { backgroundColor: colors.surfaceRaised, borderColor: colors.border };
  }
}

function textColor(v: Variant, focused: boolean, selected?: boolean): string {
  if (focused) return colors.bg;
  if (selected) return colors.text;
  if (v === 'danger') return colors.danger;
  if (v === 'ghost') return colors.textDim;
  return colors.text;
}

export function TextField({
  label,
  hint,
  error,
  style,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null; style?: StyleProp<ViewStyle> }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[styles.input, focused && styles.inputFocused, !!error && styles.inputError]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.segRow}>
        {options.map((o) => (
          <Button
            key={String(o.value)}
            label={o.label}
            icon={o.icon}
            compact
            selected={o.value === value}
            onPress={() => onChange(o.value)}
          />
        ))}
      </View>
    </View>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Focusable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      lift={1.02}
      style={(focused) => [styles.row, focused && styles.rowFocused]}
    >
      {(focused) => (
        <>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, focused && styles.rowTitleFocused]}>{label}</Text>
            {description ? <Text style={[styles.rowSub, focused && styles.rowSubFocused]}>{description}</Text> : null}
          </View>
          <View style={[styles.switch, value && styles.switchOn]}>
            <View style={[styles.knob, value && styles.knobOn]} />
          </View>
        </>
      )}
    </Focusable>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.segRow}>
        <Button icon="minus" compact disabled={value <= min} onPress={() => onChange(Math.max(min, value - step))} accessibilityLabel={`Decrease ${label}`} />
        <Text style={styles.stepValue}>
          {value}
          {suffix ? <Text style={styles.stepSuffix}> {suffix}</Text> : null}
        </Text>
        <Button icon="plus" compact disabled={value >= max} onPress={() => onChange(Math.min(max, value + step))} accessibilityLabel={`Increase ${label}`} />
      </View>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  icon,
  right,
  onPress,
  hasTVPreferredFocus,
  testID,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  right?: string;
  onPress?: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}) {
  return (
    <Focusable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      lift={1.02}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={(focused) => [styles.row, focused && styles.rowFocused]}
    >
      {(focused) => (
        <>
          {icon ? (
            <View style={[styles.rowIcon, focused && styles.rowIconFocused]}>
              <Icon name={icon} size={22} color={focused ? colors.bg : colors.accent} />
            </View>
          ) : null}
          <View style={styles.rowText}>
            <Text numberOfLines={1} style={[styles.rowTitle, focused && styles.rowTitleFocused]}>
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={[styles.rowSub, focused && styles.rowSubFocused]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right ? <Text style={[styles.rowRight, focused && styles.rowSubFocused]}>{right}</Text> : null}
          <Icon name="chevron-right" size={22} color={focused ? colors.bg : colors.textFaint} />
        </>
      )}
    </Focusable>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Banner({ tone = 'warn', icon, text }: { tone?: 'warn' | 'danger' | 'info'; icon?: IconName; text: string }) {
  const c = tone === 'danger' ? colors.danger : tone === 'info' ? colors.accent : colors.warn;
  return (
    <View style={[styles.banner, { borderColor: c }]}>
      <Icon name={icon ?? (tone === 'info' ? 'information-outline' : 'alert-outline')} size={18} color={c} />
      <Text style={[styles.bannerText, { color: c }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    minHeight: 44,
  },
  btnCompact: { paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 36 },
  btnIconOnly: { paddingHorizontal: space.sm, minWidth: 36 },
  btnFocused: { backgroundColor: colors.focus, borderColor: colors.focus },
  btnText: { fontSize: type.body, fontWeight: '600' },
  btnTextCompact: { fontSize: type.label },
  disabled: { opacity: 0.4 },
  field: { gap: space.xs + 2 },
  fieldLabel: { color: colors.textDim, fontSize: type.label, fontWeight: '600', letterSpacing: 0.3 },
  fieldHint: { color: colors.textFaint, fontSize: type.caption },
  fieldError: { color: colors.danger, fontSize: type.caption },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: type.body,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    minHeight: 44,
  },
  inputFocused: { borderColor: colors.focus, backgroundColor: colors.surfaceHover },
  inputError: { borderColor: colors.danger },
  segRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  stepValue: { color: colors.text, fontSize: type.subtitle, fontWeight: '700', minWidth: 56, textAlign: 'center' },
  stepSuffix: { color: colors.textDim, fontSize: type.label, fontWeight: '500' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rowFocused: { backgroundColor: colors.focus, borderColor: colors.focus },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconFocused: { backgroundColor: 'rgba(7,9,13,0.12)' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  rowTitleFocused: { color: colors.bg },
  rowSub: { color: colors.textDim, fontSize: type.label },
  rowSubFocused: { color: '#3A4554' },
  rowRight: { color: colors.textDim, fontSize: type.label },
  switch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: colors.accent },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textDim },
  knobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
  section: {
    color: colors.textFaint,
    fontSize: type.caption,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
  },
  bannerText: { fontSize: type.label, flex: 1 },
});
