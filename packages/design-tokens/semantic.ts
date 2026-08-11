import { palette } from './primitives';

/**
 * Semantic tokens — ported from `sovereign`'s `packages/ui/src/tokens/
 * semantic.css`, which defines a light tier at `:root` and a dark override
 * at `[data-theme='dark']` (the same two-tier convention
 * `apps/mobile/src/design-system/semantic.ts` ported for React Native).
 *
 * This is the only layer that differs between schemes. Components read
 * these names and never a primitive, so a colour can be re-pointed in one
 * place.
 */

/**
 * Framework-agnostic shadow description — not a CSS `box-shadow` string or
 * React Native's `shadow*`/`elevation` prop shape, since this package is
 * meant to stay consumable by either a future `mobile-ui` (RN) or
 * `desktop-ui` (CSS) rather than committing to one target's representation.
 * Each consumer converts: web as
 * `${offsetX}px ${offsetY}px ${blurRadius}px rgba(...)`, RN as its own
 * `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`/`elevation`
 * fields.
 */
export type Shadow = {
  color: string;
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  opacity: number;
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
  /** `color-mix(accent 12%, transparent)` upstream, resolved here since
   * not every consumer/target supports `color-mix()`. */
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
  surface: palette.grey50,
  surfaceSunken: palette.grey100,
  surfaceRaised: palette.white,

  textPrimary: palette.grey800,
  textMuted: palette.grey500,
  textSubtle: palette.grey400,
  textOnAccent: palette.white,

  border: palette.grey200,
  borderStrong: palette.grey300,

  accent: palette.clay700,
  accentHover: palette.clay800,
  // clay700 (#a54b2e) at 12%. CSS could resolve this with color-mix; not
  // every consumer can, so it stays precomputed.
  accentSubtle: 'rgba(165, 75, 46, 0.12)',
  focusRing: palette.clay700,

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

  // Warm-tinted, not neutral black — matches the warm surface it darkens.
  scrim: 'rgba(21, 16, 10, 0.5)',
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

  accent: palette.clay300,
  accentHover: palette.clay400,
  // clay300 (#e6a183) at 16% — a touch stronger than light mode's 12% tint,
  // since it needs to read against the darker warm surface.
  accentSubtle: 'rgba(230, 161, 131, 0.16)',
  focusRing: palette.clay200,

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
 * stay visible — the same reason upstream `semantic.css` redefines them
 * under `[data-theme='dark']`.
 */
function shadows(scheme: 'light' | 'dark') {
  const strong = scheme === 'dark';
  return {
    card: {
      color: palette.black,
      offsetX: 0,
      offsetY: 1,
      blurRadius: 3,
      opacity: strong ? 0.4 : 0.1,
    },
    overlay: {
      color: palette.black,
      offsetX: 0,
      offsetY: 10,
      blurRadius: 38,
      opacity: strong ? 0.6 : 0.18,
    },
    control: {
      color: palette.black,
      offsetX: 0,
      offsetY: 1,
      blurRadius: 3,
      opacity: strong ? 0.5 : 0.2,
    },
  } satisfies Record<string, Shadow>;
}

export const lightShadows = shadows('light');
export const darkShadows = shadows('dark');

/**
 * Typography (task 7.3): Hanken Grotesk (body) · JetBrains Mono (code).
 * Fallback-stack only — no font files are bundled anywhere in this repo, on
 * any platform. The family name is simply named first in the CSS stack, so
 * a browser (or, on mobile, `apps/mobile`'s own RN `fontFamily` override —
 * see that theme's own comment) silently falls back to the system font
 * until/unless a later task actually ships the font files.
 */
export const fontFamily = {
  body: `'Hanken Grotesk', -apple-system, 'Segoe UI', system-ui, sans-serif`,
  mono: `'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace`,
} as const;
