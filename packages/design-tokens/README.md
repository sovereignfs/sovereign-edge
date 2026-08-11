# `packages/design-tokens`

Colors, spacing, and typography as plain data — no components, no
framework dependency (no `react` import). Populated (task 12.6) by porting
the same three-tier structure `apps/mobile/src/design-system/{primitives,
semantic,theme}.ts` already uses (task 7.1): `primitives.ts` (raw palette/
scale values), `semantic.ts` (light/dark `SemanticColors`, shadows,
`fontFamily`), `theme.ts` (assembles `Theme`, exports `lightTheme`/
`darkTheme`/`themeFor(scheme)`).

This package is the single source of truth for these numbers. The palette
(warm `grey` neutrals + a `clay` accent scale, replacing Sovereign's cool
monochrome identity) and `fontFamily` (Hanken Grotesk / JetBrains Mono) were
revamped in task 7.3, validated first in `reference.html` (same directory —
an interactive, dependency-free preview; keep it in sync with any future
token change here).

**Currently consumed by:** `packages/desktop-ui` and, since task 7.3,
`apps/mobile/src/design-system` — the mobile app's `theme.ts` imports
`palette`/`space`/`radius`/`fontSize`/`iconSize`/`motion`/`touchTargetMin`
and `lightColors`/`darkColors`/`SemanticColors` from here directly rather
than hand-copying them; its old `primitives.ts` was deleted entirely. A
trimmed `apps/mobile/src/design-system/semantic.ts` still exists, holding
only the pieces that genuinely can't be shared as-is:

- `fontFamily` here is a CSS-style fallback *stack* (`"'Hanken Grotesk',
  -apple-system, ..."`); React Native's `fontFamily` style property wants a
  single bare family name instead, so mobile names it directly —
  `'Hanken Grotesk'` / `'JetBrains Mono'` — rather than deriving it from
  this package's stack string. No font files are bundled on either
  platform; RN falls back to the system font when the named family isn't
  registered, the same "fallback applies when not loaded" effect the CSS
  stack gives desktop-ui.
- `fontWeight` values are numbers here (`400`), not the string-literal
  union (`'400'`) React Native's `fontWeight` style wants — mobile's
  `theme.ts` keeps its own literal string constants rather than deriving
  them, so the type stays the RN-accepted union instead of widening to
  `string`.
- `Shadow` is a framework-agnostic `{color, offsetX, offsetY, blurRadius,
  opacity}` shape rather than either CSS `box-shadow` or React Native's
  `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`/`elevation`
  props — each consumer converts to what it needs; mobile's `semantic.ts`
  computes its own RN-shaped shadows rather than converting this package's.
