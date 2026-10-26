import { useState } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { isTV } from './theme';

export interface FocusableProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle> | ((focused: boolean) => StyleProp<ViewStyle>);
  children: React.ReactNode | ((focused: boolean) => React.ReactNode);
  /** Scale up slightly when focused (TV "lift" effect). */
  lift?: number;
  hasTVPreferredFocus?: boolean;
}

/**
 * Pressable that tracks D-pad focus and animates a subtle lift on TV.
 * Works the same with touch (focus never fires on phones).
 */
export function Focusable({ style, children, lift = 1.04, onFocus, onBlur, ...rest }: FocusableProps) {
  const [focused, setFocused] = useState(false);
  const [scale] = useState(() => new Animated.Value(1));

  const animate = (to: number) => {
    if (!isTV || lift === 1) return;
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  };

  const resolved = typeof style === 'function' ? style(focused) : style;
  return (
    <Animated.View style={[{ transform: [{ scale }] }, flattenOuter(resolved)]}>
      <Pressable
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          animate(lift);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          animate(1);
          onBlur?.(e);
        }}
        style={flattenInner(resolved)}
      >
        {typeof children === 'function' ? children(focused) : children}
      </Pressable>
    </Animated.View>
  );
}

// Layout props (flex, margins, width) go on the animated wrapper; the rest on the pressable.
const OUTER_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'height', 'minWidth', 'maxWidth',
  'minHeight', 'maxHeight', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'position', 'top', 'left', 'right', 'bottom', 'aspectRatio', 'zIndex',
]);

function flat(style: StyleProp<ViewStyle>): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map((s) => flat(s as StyleProp<ViewStyle>)));
  return { ...(style as object) };
}

function flattenOuter(style: StyleProp<ViewStyle>): ViewStyle {
  const s = flat(style);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(s)) if (OUTER_KEYS.has(k)) out[k] = s[k];
  return out as ViewStyle;
}

function flattenInner(style: StyleProp<ViewStyle>): ViewStyle {
  const s = flat(style);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(s)) if (!OUTER_KEYS.has(k) || k === 'aspectRatio') out[k] = s[k];
  const hasSize = 'width' in s || 'height' in s || 'flex' in s || 'flexGrow' in s;
  if (hasSize) out.flex = 1;
  delete out.aspectRatio;
  return out as ViewStyle;
}
