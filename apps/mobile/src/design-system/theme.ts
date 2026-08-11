import {
  darkColors,
  fontSize,
  iconSize,
  lightColors,
  motion,
  radius,
  space,
  touchTargetMin,
  type SemanticColors,
} from 'design-tokens';

import { darkShadows, fontFamily, lightShadows, type Shadow } from './semantic';

export type ColorScheme = 'light' | 'dark';

/**
 * React Native's `fontWeight` style wants a string literal ('400'), not the
 * number `design-tokens` exports for its web-facing consumers — same
 * divergence documented in `design-tokens/README.md`. Kept as literals
 * (not derived from the numeric export via `String()`) so the type stays
 * the RN-accepted string-literal union instead of widening to `string`.
 */
const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export type Theme = {
  scheme: ColorScheme;
  colors: SemanticColors;
  shadows: Record<'card' | 'overlay' | 'control', Shadow>;
  space: typeof space;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  fontFamily: typeof fontFamily;
  iconSize: typeof iconSize;
  motion: typeof motion;
  touchTargetMin: number;
};

/**
 * Everything except `colors` and `shadows` is identical across schemes —
 * upstream calls these "scale tokens are theme-stable". Spacing and type
 * sizes do not change when the lights go out.
 */
const scale = {
  space,
  radius,
  fontSize,
  fontWeight,
  fontFamily,
  iconSize,
  motion,
  touchTargetMin,
} as const;

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  shadows: lightShadows,
  ...scale,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
  shadows: darkShadows,
  ...scale,
};

export function themeFor(scheme: ColorScheme): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}
