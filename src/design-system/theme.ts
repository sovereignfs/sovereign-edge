import {
  fontSize,
  fontWeight,
  iconSize,
  motion,
  radius,
  space,
  touchTargetMin,
} from './primitives';
import {
  darkColors,
  darkShadows,
  fontFamily,
  lightColors,
  lightShadows,
  type SemanticColors,
  type Shadow,
} from './semantic';

export type ColorScheme = 'light' | 'dark';

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
 * upstream calls these "scale tokens are theme-stable". Spacing and type sizes
 * do not change when the lights go out.
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
