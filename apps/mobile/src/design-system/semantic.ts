import { Platform } from 'react-native';

import { palette } from './primitives';

/**
 * Semantic tokens — ported from `sovereign`'s
 * `packages/ui/src/tokens/semantic.css`, which defines a light tier at
 * `:root` and a dark override at `[data-theme='dark']`.
 *
 * This is the only layer that differs between schemes. Components read these
 * names and never a primitive, so a colour can be re-pointed in one place —
 * which is exactly what the epic's review checklist tests.
 */

/** Shadow tokens, expressed the way React Native styles them. */
export type Shadow = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android draws shadows from elevation alone; the iOS fields are ignored. */
  elevation: number;
};

export type SemanticColors = {
  surface: string;
  surfaceSunken: string;
  surfaceRaised: string;

  textPrimary: string;
  textMuted: string;
  textSubtle: string;
  textOnAccent: string;

  border: string;
  borderStrong: string;

  accent: string;
  accentHover: string;
  /** `color-mix(accent 12%, transparent)` upstream, resolved here. */
  accentSubtle: string;
  focusRing: string;

  errorSurface: string;
  errorText: string;
  errorBorder: string;
  errorSolid: string;
  textOnError: string;

  warningSurface: string;
  warningText: string;
  warningBorder: string;

  successSurface: string;
  successText: string;
  successBorder: string;
  successSolid: string;
  textOnSuccess: string;

  infoSurface: string;
  infoText: string;
  infoBorder: string;

  scrim: string;
};

export const lightColors: SemanticColors = {
  surface: palette.white,
  surfaceSunken: palette.grey50,
  surfaceRaised: palette.white,

  textPrimary: palette.grey950,
  textMuted: palette.grey500,
  textSubtle: palette.grey400,
  textOnAccent: palette.white,

  border: palette.grey200,
  borderStrong: palette.grey300,

  accent: palette.grey900,
  accentHover: palette.grey700,
  // grey900 (#18181b) at 12%. CSS resolves this with color-mix; React Native
  // has no equivalent, so it is precomputed.
  accentSubtle: 'rgba(24, 24, 27, 0.12)',
  focusRing: palette.grey900,

  errorSurface: palette.red100,
  errorText: palette.red800,
  errorBorder: palette.red200,
  errorSolid: palette.red700,
  textOnError: palette.white,

  warningSurface: palette.amber100,
  warningText: palette.amber800,
  warningBorder: palette.amber200,

  successSurface: palette.green100,
  successText: palette.green800,
  successBorder: palette.green200,
  successSolid: palette.green800,
  textOnSuccess: palette.white,

  infoSurface: palette.blue100,
  infoText: palette.blue800,
  infoBorder: palette.blue200,

  scrim: 'rgba(0, 0, 0, 0.5)',
};

export const darkColors: SemanticColors = {
  surface: palette.grey950,
  surfaceSunken: palette.grey900,
  surfaceRaised: palette.grey900,

  textPrimary: palette.grey50,
  textMuted: palette.grey400,
  textSubtle: palette.grey600,
  textOnAccent: palette.grey950,

  border: palette.grey800,
  borderStrong: palette.grey700,

  accent: palette.grey50,
  accentHover: palette.grey200,
  // grey50 (#fafafa) at 12%.
  accentSubtle: 'rgba(250, 250, 250, 0.12)',
  focusRing: palette.grey100,

  errorSurface: palette.red900,
  errorText: palette.red200,
  errorBorder: palette.red700,
  errorSolid: palette.red700,
  textOnError: palette.white,

  warningSurface: palette.amber900,
  warningText: palette.amber200,
  warningBorder: palette.amber800,

  successSurface: palette.green900,
  successText: palette.green200,
  successBorder: palette.green800,
  successSolid: palette.green800,
  textOnSuccess: palette.white,

  infoSurface: palette.blue900,
  infoText: palette.blue100,
  infoBorder: palette.blue800,

  scrim: 'rgba(0, 0, 0, 0.5)',
};

/**
 * Shadows are semantic because they carry more opacity on dark surfaces to
 * stay visible — the same reason `semantic.css` redefines them under
 * `[data-theme='dark']`.
 */
function shadows(scheme: 'light' | 'dark') {
  const strong = scheme === 'dark';
  return {
    card: {
      shadowColor: palette.black,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: strong ? 0.4 : 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    overlay: {
      shadowColor: palette.black,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: strong ? 0.6 : 0.18,
      shadowRadius: 38,
      elevation: 16,
    },
    control: {
      shadowColor: palette.black,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: strong ? 0.5 : 0.2,
      shadowRadius: 3,
      elevation: 1,
    },
  } satisfies Record<string, Shadow>;
}

export const lightShadows = shadows('light');
export const darkShadows = shadows('dark');

/**
 * Typography.
 *
 * Sovereign pairs Hanken Grotesk with JetBrains Mono, supplied by the
 * operator as a web font. Neither is bundled here yet, and naming a font
 * React Native cannot resolve renders unpredictably — silently substituted on
 * iOS, worse on Android. So the system stack is used until the font files are
 * actually shipped and loaded (`expo-font`), which belongs with task 7.2.
 */
export const fontFamily = {
  body: Platform.select({ ios: 'System', android: 'sans-serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace' }),
} as const;
