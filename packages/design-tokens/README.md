# `packages/design-tokens`

Colors, spacing, and typography as plain data — no components, no
framework dependency (no `react` import). Populated (task 12.6) by porting
the same three-tier structure `apps/mobile/src/design-system/{primitives,
semantic,theme}.ts` already uses (task 7.1): `primitives.ts` (raw palette/
scale values), `semantic.ts` (light/dark `SemanticColors`, shadows,
`fontFamily`), `theme.ts` (assembles `Theme`, exports `lightTheme`/
`darkTheme`/`themeFor(scheme)`).

**Ported by hand, not shared by import** — same relationship
`apps/mobile/src/design-system/primitives.ts` has to `sovereign`'s own
`packages/ui/src/tokens/`. This package is the single source of truth for
these numbers *within this repo* now; `apps/mobile/src/design-system` still
carries its own copy (extracting it to depend on this package instead is
future work, not yet done — the two currently just happen to agree).

**Currently consumed by:** `packages/desktop-ui`. `apps/mobile/src/
design-system` does not depend on this package (its own token files predate
it and haven't been migrated). Values that differ from mobile's own copy,
and why:

- `fontWeight` values are numbers here (`400`), not the strings mobile's
  React Native layer needs (`'400'`) — CSS `font-weight` and most JS
  consumers want a number.
- `fontFamily` uses web-safe system font stacks
  (`system-ui, -apple-system, ...`) rather than mobile's `Platform.select`
  RN font names. Neither is Sovereign's real intended pairing (Hanken
  Grotesk + JetBrains Mono) — that isn't bundled anywhere in this repo yet,
  on any platform.
- `Shadow` is a framework-agnostic `{color, offsetX, offsetY, blurRadius,
  opacity}` shape rather than either CSS `box-shadow` or React Native's
  `shadow*`/`elevation` props — each consumer converts to what it needs.
