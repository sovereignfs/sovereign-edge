/**
 * Primitive tokens — raw values, ported by hand from `sovereign`'s
 * `packages/ui/src/tokens/primitives.css`.
 *
 * Ported rather than shared: `@sovereignfs/ui` is CSS Modules and web React,
 * neither of which React Native can consume. Per epic 7 the goal is the same
 * *visual language*, not a code dependency — this app stays standalone.
 *
 * `rem` values are converted at the CSS default of 1rem = 16px. React Native's
 * unitless sizes are density-independent pixels, so the numbers below are
 * already in the unit RN wants.
 *
 * Nothing outside `semantic.ts` should import from here. Primitives say what a
 * colour *is*; semantic tokens say what it is *for*, and only the latter
 * changes between light and dark.
 */

export const palette = {
  white: '#ffffff',
  black: '#000000',

  grey50: '#fafafa',
  grey100: '#f4f4f5',
  grey200: '#e4e4e7',
  grey300: '#d4d4d8',
  grey400: '#a1a1aa',
  grey500: '#71717a',
  grey600: '#52525b',
  grey700: '#3f3f46',
  grey800: '#27272a',
  grey900: '#18181b',
  grey950: '#09090b',

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

/** `--sv-space-*`, in dp. */
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
 * `--sv-radius-*` at `--sv-radius-scale: 1`.
 *
 * Sovereign lets an operator rescale these per instance. That knob is not
 * ported: it exists so a self-hosted deployment can be branded, and this app
 * is a single product rather than a platform others deploy. `full` is a shape
 * token (pill/avatar) and is excluded from scaling there for the same reason
 * it is a flat value here.
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

/** `--sv-font-size-*`, in dp. */
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
 * React Native wants weights as strings.
 *
 * Only these four exist upstream; adding more would invent design decisions
 * rather than port them.
 */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const iconSize = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
} as const;

/**
 * WCAG 2.5.5 / Apple HIG / Material minimum for reliable touch without a
 * pointing device. Every icon-only control should meet it — on a phone this
 * matters more than it does on Sovereign's web surface, where a mouse is
 * usually available.
 */
export const touchTargetMin = 44;

export const motion = {
  durationFast: 150,
  durationBase: 250,
  durationSlow: 350,
  /** Bezier control points, in the order `Easing.bezier` takes them. */
  easeOut: [0, 0, 0.2, 1],
  easeInOut: [0.4, 0, 0.2, 1],
  easeSpring: [0.34, 1.56, 0.64, 1],
} as const;
