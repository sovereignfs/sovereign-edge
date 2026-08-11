import { palette } from 'design-tokens';

/**
 * RN-specific residue of the semantic token layer (task 7.3). Colours
 * (`lightColors`/`darkColors`/`SemanticColors`) now come straight from
 * `design-tokens` — see `theme.ts`. What's left here is what genuinely
 * can't be shared as-is, because the shape or the platform differs:
 *
 * - `Shadow`/`shadows()`: React Native styles shadows as `shadowColor`/
 *   `shadowOffset`/`shadowOpacity`/`shadowRadius`/`elevation`, not a CSS
 *   `box-shadow` or `design-tokens`' own framework-agnostic `{color,
 *   offsetX, offsetY, blurRadius, opacity}` shape — each consumer converts,
 *   per that package's own README. The four opacity values below are
 *   ported by hand from the same source `design-tokens/semantic.ts` used.
 * - `fontFamily`: RN's `fontFamily` style wants one resolvable family name,
 *   not a CSS fallback stack. Named directly here (not derived from
 *   `design-tokens`' stack string) since neither font ships as a bundled
 *   asset yet — RN falls back to the system font when a named family isn't
 *   registered, the same "fallback applies when not loaded" behaviour the
 *   CSS stack gives desktop-ui.
 */
export type Shadow = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android draws shadows from elevation alone; the iOS fields are ignored. */
  elevation: number;
};

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

export const fontFamily = {
  body: 'Hanken Grotesk',
  mono: 'JetBrains Mono',
} as const;
