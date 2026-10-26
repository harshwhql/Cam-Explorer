import { Platform } from 'react-native';

export const isTV = Platform.isTV === true;

export const colors = {
  bg: '#07090D',
  surface: '#10151C',
  surfaceRaised: '#161D27',
  surfaceHover: '#1D2633',
  border: '#232C3A',
  text: '#EEF2F7',
  textDim: '#8B97A7',
  textFaint: '#5A6676',
  accent: '#5B8CFF',
  accentSoft: 'rgba(91,140,255,0.16)',
  teal: '#2EE6C5',
  focus: '#FFFFFF',
  live: '#2BD67B',
  warn: '#FFB547',
  danger: '#FF5C6C',
  overlay: 'rgba(5,7,10,0.72)',
} as const;

// TVs render at ~960x540dp; phones and tablets vary. Scale type a little up on TV for 10-foot reading.
const tvScale = isTV ? 1 : 1;
export const type = {
  hero: 34 * tvScale,
  title: 24 * tvScale,
  subtitle: 18 * tvScale,
  body: 15 * tvScale,
  label: 13 * tvScale,
  caption: 11 * tvScale,
};

export const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };

/** Android TV overscan-safe margins (≈5%). Phones use safe-area insets instead. */
export const tvSafe = { horizontal: isTV ? 48 : 16, vertical: isTV ? 27 : 12 };
