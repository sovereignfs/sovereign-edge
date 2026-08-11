/**
 * Primitive tokens — raw values, ported by hand from `sovereign`'s
 * `packages/ui/src/tokens/primitives.css`, the same source
 * `apps/mobile/src/design-system/primitives.ts` was ported from (task 7.1).
 *
 * Ported rather than shared: `@sovereignfs/ui` is CSS Modules and web React
 * with its own build, and this repo's own goal (per epic 7's own framing)
 * is the same *visual language*, not a code dependency on an external
 * package. This file is this repo's single source of truth for these
 * numbers.
 *
 * The warm grey scale and the `clay` accent scale (task 7.3) replace
 * Sovereign's cool-grey monochrome identity with Edge's own — validated
 * interactively in `reference.html` (same directory) before landing here.
 * Never edit the values in one place without the other; `reference.html`
 * is the visual source of truth this file is expected to match.
 *
 * Nothing outside `semantic.ts` should import from here. Primitives say
 * what a colour *is*; semantic tokens say what it is *for*, and only the
 * latter changes between light and dark.
 */

export const palette = {
  white: '#ffffff',
  black: '#000000',

  grey50: '#f7f5f0',
  grey100: '#edeae1',
  grey200: '#ddd7c9',
  grey300: '#c7beab',
  grey400: '#a79c86',
  grey500: '#8b8069',
  grey600: '#6e6452',
  grey700: '#52493a',
  grey800: '#382f24',
  grey900: '#241d15',
  grey950: '#15100a',

  clay100: '#f7e4db',
  clay200: '#efc3ae',
  clay300: '#e6a183',
  clay400: '#de8067',
  clay500: '#d97757',
  clay600: '#c15f3e',
  clay700: '#a54b2e',
  clay800: '#7c3820',
  clay900: '#542613',

  amber100: '#fff7ed',
  amber200: '#fed7aa',
  amber800: '#b45309',
  amber900: '#92400e',

  green100: '#ecfdf3',
  green200: '#bbf7d0',
  green800: '#167c4a',
  green900: '#14532d',

  red100: '#fef2f2',
  red200: '#fecaca',
  red700: '#b91c1c',
  red800: '#991b1b',
  red900: '#7f1d1d',

  blue100: '#eff6ff',
  blue200: '#dbeafe',
  blue800: '#1d4ed8',
  blue900: '#1e3a8a',
} as const;

/** In CSS px / RN dp — both are density-independent, so one number serves
 * either consumer without conversion. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/**
 * Sovereign lets an operator rescale these per instance (`--sv-radius-scale`
 * upstream). That knob is not ported: it exists so a self-hosted deployment
 * can be branded, and this app is a single product rather than a platform
 * others deploy. `full` is a shape token (pill/avatar) and stays flat for
 * the same reason it isn't scaled upstream either.
 */
export const radius = {
  sm: 6,
  md: 8,
  lg: 11,
  xl: 12,
  '2xl': 14,
  '3xl': 20,
  full: 9999,
} as const;

export const fontSize = {
  label: 11,
  xs: 12,
  caption: 13,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
} as const;

/**
 * Numeric so a CSS-in-JS/CSS-custom-property consumer can use these
 * directly as `font-weight` — React Native wants them as strings instead,
 * which is why mobile's own copy of this token differs in type even though
 * the values are identical.
 */
export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const iconSize = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
} as const;

/**
 * WCAG 2.5.5 / Apple HIG / Material minimum for reliable touch without a
 * pointing device. Matters less on a desktop surface with a mouse than on
 * mobile, but costs nothing to carry over, and a future touchscreen/tablet
 * desktop session benefits from the same floor mobile already established.
 */
export const touchTargetMin = 44;

/** Bezier control points, in the order CSS `cubic-bezier()` / RN's
 * `Easing.bezier` both take them. */
export const motion = {
  durationFast: 150,
  durationBase: 250,
  durationSlow: 350,
  easeOut: [0, 0, 0.2, 1],
  easeInOut: [0.4, 0, 0.2, 1],
  easeSpring: [0.34, 1.56, 0.64, 1],
} as const;
