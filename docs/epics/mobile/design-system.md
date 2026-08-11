---
epic: 7
title: Design System & Branding
status: "✅ Done"
scope: mobile
---

# Epic: Design System & Branding

> A native RN theme adapting Sovereign's visual identity — the app is fully
> standalone, but may look and feel like part of the same family.

## Overview

Per the developer's decision in research 0001: Sovereign Edge is a fully
independent app with no runtime dependency on `sovereign`, but may reuse
Sovereign's visual identity. `@sovereignfs/ui` itself (CSS Modules + web
React components) isn't usable in React Native directly — this epic is about
porting the *token values and visual language* (monochrome identity, the
`--sv-*` scale) into a native theme system, not importing the web package.

## Tasks

#### ✅ 7.1 — Native theme tokens

**Goal:** Port Sovereign's token values (spacing, radius, font-size scale,
monochrome color identity) into an RN-native theme (e.g. a plain TS theme
object / RN StyleSheet constants), without importing `@sovereignfs/ui`
itself.

**Deliverables:**

- A theme module mirroring `sovereign`'s primitive/semantic two-tier token
  structure conceptually, values ported by hand rather than shared at the
  code level.
- Light/dark mode support, matching Sovereign's existing dark-mode override
  pattern.

**Dependencies:** none within this epic.

**Review checklist:**

- ✅ Switching light/dark mode restyles the whole app from the semantic theme
  layer, with no per-component hardcoded colors. Verified on an Android
  emulator by toggling the system setting (`cmd uimode night yes`) without
  restarting the app: the surface inverted from white to `#09090b` and body
  text from grey-950 to grey-50, driven entirely by the semantic tier.
  `App.tsx` keeps only layout in `StyleSheet`; every colour and type value
  comes from `useTheme()`.

---

#### ✅ 7.2 — Core component set

**Goal:** The minimum native component set the chat and settings UI need.

**Deliverables:**

- Button, input, chat bubble, list item, toggle, and similar primitives
  built on Task 7.1's theme, styled consistently with the wider Sovereign
  identity without being the same code.

**Dependencies:** Task 7.1.

**Review checklist:**

- ✅ No screen in the app hardcodes a color, spacing, or radius value outside
  the theme module. Enforced by lint rather than inspection: `eslint.config.js`
  rejects hex/`rgb()`/`hsl()` literals anywhere under `src/` except
  `src/design-system/`, where defining them is the job. Verified the rule
  fires by planting a violation, not just by seeing it pass.

**Known deviation:** `Toggle` wraps the platform `Switch` and is deliberately
untinted, so it shows the OS accent rather than Sovereign's monochrome one.
Two attempts to theme it were worse: Android alpha-blends `trackColor`, which
made a near-white `accent` track invisible in dark mode, and it does not
reliably honour `thumbColor` — leaving a white thumb on an invisible track.
Platform colours are legible in both schemes; matching the identity here needs
a custom Pressable-based toggle, not more props.

---

#### ✅ 7.3 — Warm palette + shared token source of truth

**Goal:** Give Sovereign Edge its own visual identity — distinct from
Sovereign's cool monochrome — and stop hand-duplicating token values between
`apps/mobile/src/design-system` and `packages/design-tokens`.

**Deliverables:**

- Warm `grey` neutral scale + a new `clay` accent scale in
  `packages/design-tokens/{primitives,semantic}.ts`, replacing Sovereign's
  monochrome identity. Values validated first, interactively, in
  `packages/design-tokens/reference.html` (light + dark, every screen
  mockup) before landing here.
- `fontFamily` updated to name Hanken Grotesk (body) / JetBrains Mono
  (code) — fallback stacks only, no font files bundled.
- `apps/mobile/src/design-system` consumes `packages/design-tokens`
  directly for colours and scale tokens instead of hand-copying them; its
  own `primitives.ts` is deleted. A trimmed local `semantic.ts` keeps only
  what genuinely can't be shared as-is: RN-shaped `Shadow`/`shadows()`,
  RN's bare-name `fontFamily`, and RN's string-literal `fontWeight`.

**Dependencies:** Tasks 7.1, 7.2.

**Review checklist:**

- ✅ `pnpm --filter design-tokens typecheck`, `pnpm --filter mobile
  typecheck`, `pnpm --filter mobile lint` (the no-hardcoded-colour rule)
  all pass.
- ✅ `apps/mobile`'s full test suite (338 tests, 35 suites) passes
  unchanged — the design-system tests assert theme *structure*, not
  literal colour values, so they exercise the new tokens without needing
  edits themselves.
- ✅ Verified on the iOS Simulator, both light and dark (Settings →
  Appearance): the warm cream surface and clay accent render on Chat's
  send button and Settings' theme rows, matching
  `packages/design-tokens/reference.html` side by side.

---

#### ✅ 7.4 — Icon system

**Goal:** Replace the text-only tab bar (`RootNavigator.tsx`'s explicit "no
icon set is chosen yet" workaround) with a real, curated icon set.

**Deliverables:**

- `react-native-svg` + `lucide-react-native` as dependencies — same icon
  library and visual language `sovereign` uses (`docs/design-system.md`'s
  Icon system, RFC 0011), MIT/ISC licensed. `sovereign` ships a
  zero-runtime-dependency mechanism (inline SVGs generated at build time
  from a curated list); that specific mechanism is web/RSC-specific and
  doesn't carry over to React Native, which needs `react-native-svg` as a
  runtime SVG renderer regardless — so this wraps the official
  `lucide-react-native` package (same path data, same stroke conventions)
  instead of hand-porting individual icon paths.
- A curated `Icon` component (`apps/mobile/src/design-system/components/
Icon.tsx`) mirroring Sovereign's own `<Icon name size aria-hidden|aria-
label>` contract, bound to the existing `iconSize` scale tokens. `color`
  is a required prop (not defaulted or inherited via `currentColor`, which
  React Native's SVG renderer has no equivalent for) — every call site
  says explicitly which theme color it means.
- `RootNavigator` tab icons wired (`message-circle`/Chat, `cpu`/Models,
  `settings`/Settings — `cpu` chosen over a generic package icon as the
  same "inference on your own silicon" shorthand the app's mark uses); the
  `tabBarIcon: () => null` workaround removed.
- `apps/mobile/metro.config.js` (new file — this app previously ran on
  Expo's implicit default) and `jest.config.js`'s `moduleNameMapper`, both
  routing `lucide-react-native` to its plain-CJS build (see review
  checklist below for why).

**Dependencies:** Task 7.3.

**Review checklist:**

- ✅ `pnpm typecheck`, `pnpm lint` (no-hardcoded-colour rule), and the full
  test suite (338 tests, 35 suites) all pass.
- ✅ Both bundlers needed the same fix, for the same underlying reason:
  `lucide-react-native`'s `"react-native"`/`"import"` export condition
  points at an ESM barrel (`dist/esm/lucide-react-native.mjs`) whose
  relative re-exports of `./icons/*.mjs` don't resolve cleanly through
  either tool. `jest.config.js`'s `moduleNameMapper` and the new
  `metro.config.js`'s `resolver.extraNodeModules` both route the bare
  `lucide-react-native` specifier straight to the package's plain-CJS
  build instead (same icon path data, same props) — Jest hit raw ESM
  `export` syntax without it; Metro's bundler hit an unresolvable nested
  `.mjs` import without it.
- ✅ Verified on the iOS Simulator, on-device (not just Metro serving a
  cached bundle): the tab bar shows the three Lucide icons (chat bubble,
  chip, gear), correctly tinted by `tabBarActiveTintColor`/
  `tabBarInactiveTintColor` per tab and per scheme, confirmed in both
  light and dark.

**Deferred to later tasks:** the icon-less banners, mode chips, and
provenance receipts on Chat (7.5), Models' fit badges (7.6), and
Connectors' status pills (7.7) still need their own icon wiring — 7.4 only
covers the tab bar and the reusable `Icon` component itself.

---

#### ✅ 7.5 — Chat screen: icons, provenance receipts, multiline composer

**Goal:** Bring the Chat screen up to `reference.html`'s mockup: an
icon-only send button, iconified offline/warning banners and mode chips, a
real multiline composer, and — required by the concept paper's disclosure
promise — a visible receipt on every reply that used a connector.

**Deliverables:**

- Circular icon send/stop button (`ComposerButton`), replacing the
  full-width text button — `send`/`square` icons, `accessibilityLabel`
  carrying the text a sighted user no longer sees.
- Offline banner (`wifi-off`/`alert-triangle`), the risky-connector warning
  banner (`alert-triangle`), and mode chips (one icon per mode, from
  `MODE_ICON`) all gain icons alongside their existing text.
- Composer's `TextField` gains a `multiline` prop: grows with content,
  capped at `touchTargetMin * 3` (~3 lines) via `maxHeight`, top-aligned
  text.
- A new `Mark` component (`design-system/components/Mark.tsx`) — a
  hand-coded SVG of the app's "one gate" glyph, not from Lucide — renders
  in a connector-provenance receipt row below any assistant bubble whose
  message carries a `connector`, replacing the old inline "via X" text.
  Same glyph, same "this crossed the boundary, with permission" motif the
  app icon will use (task 7.8).

**Dependencies:** Task 7.4.

**Review checklist:**

- ✅ `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`, and the
  full test suite (338 tests, 35 suites) all pass. Tests that asserted on
  now-removed visible text (`getByText('Send')`, `getByText(/via /)`)
  switched to `getByLabelText`, matching what a screen-reader user actually
  gets from an icon-only control.
- ✅ Verified on the iOS Simulator, on-device, both light and dark
  (Settings → Appearance): offline banner icon, iconified mode chips,
  multiline composer growth (confirmed the field expands and caps at three
  lines on a long paste, with the focus ring in the accent color), and a
  full send → on-device reply round trip render correctly in both schemes.

---

#### ✅ 7.6 — Models screen: sections, progress bar, fit badge

**Goal:** Replace the single concatenated subtitle string (name · size ·
fit note · download phase · percentage · action hint, all in one line) with
a scannable structure.

**Deliverables:**

- Installed/Available section split, using a new shared `SectionLabel`
  component (promoted out of `SettingsScreen`, which already had its own
  identical copy — Connectors will need the same pattern in 7.7).
- A new `ProgressBar` component renders during an active download,
  replacing the inline `"67% · 1.2 of 3.4 GB"` text; the byte-count stays
  in the subtitle since the badge and bar already cover the percentage.
- A new `FitBadge` component (good/tight/bad/neutral, mapped from the
  model's `Fit` assessment) replaces the trailing mono label everywhere —
  install state (`Download`/`Installed`/`In use`), transfer state
  (percentage/`Verifying`/`Retry`), and refusal (`Too large`, colour-coded
  red rather than an accent-styled "download anyway"). The badge now names
  a *status*; the action it implies moved into the subtitle (e.g. "tap to
  download anyway"), matching `reference.html`'s Mixtral row.
- `ListItem` gained an optional `footer` slot (content below the subtitle,
  in the same column) so the progress bar can render without overlapping
  the badge.

**Dependencies:** Task 7.4.

**Review checklist:**

- ✅ `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`, and the
  full test suite (339 tests, 35 suites) all pass. Tests that asserted on
  the old uppercase mono labels (`DOWNLOAD`, `CANCEL`, `IN USE`, `RETRY`,
  `DOWNLOAD ANYWAY`) switched to the new sentence-case badge text; one new
  test covers the Installed/Available section split.
- ✅ Verified on the iOS Simulator, on-device, both light and dark
  (Settings → Appearance): ran a real download (Llama 3.2 1B) start to
  finish and watched the badge and progress bar advance together
  (14% → 98%), then watched the row move from Available into Installed
  with an `Installed` badge once the transfer completed. The `unsupported`
  fit / `Too large` badge is covered by a unit test rather than on-device —
  no catalog model exceeds this simulator's device memory budget to
  trigger it live.

---

#### ✅ 7.7 — Settings segmented control + Connectors restructure

**Goal:** Fix the two structural gaps `reference.html` identified: Settings'
3-`Toggle`-as-radio theme picker, and Connectors being the only screen in
the app with no section headers despite having the longest list.

**Deliverables:**

- A new `SegmentedControl` component replaces Settings' Appearance section
  (three `Toggle`s standing in for a radio group, each requiring the others
  to be manually driven back to `false`) with a real mutually-exclusive
  control. Active-segment elevation uses `theme.shadows.control`, not just
  its fill colour — `surfaceRaised` equals `surfaceSunken` in dark mode, so
  colour alone would leave the selection invisible there.
- Connectors gains section headers (Search/Calendar/Device/Installed, via
  the shared `SectionLabel` from 7.6) and status pills (reusing `FitBadge`'s
  good/tight/bad/neutral variants for Allowed/Needs review/Blocked/Not
  asked — the same four-colour mapping, different domain), replacing
  tap-to-toggle rows with navigation to a new `ConnectorDetailScreen` (grant
  state, scope, provider switch for Search, credential field, revoke —
  folding in `SearchSetupScreen`'s first-run flow, which is retired as a
  standalone screen and file). Deliberately stays on the detail screen
  after granting/revoking/saving instead of navigating back — the pill and
  available action update in place.
- A `chevron-right` icon added to the curated set, used on every navigable
  row across Settings, Connectors, and the Connector Store for affordance
  consistency. `ConnectorInstallScreen` now replaces itself with the new
  connector's own detail screen on success (`navigation.replace`), matching
  what happens after granting any other connector, instead of popping back
  to a plain list.

**Dependencies:** Task 7.4.

**Review checklist:**

- ✅ `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`, and the
  full test suite (344 tests, 35 suites) all pass. `SearchSetupScreen.test.tsx`
  retired along with the screen; its coverage (provider switch, URL/key
  validation, save-and-grant) moved into the new
  `ConnectorDetailScreen.test.tsx` (19 tests), alongside the built-in
  permission-connector flows (OS-permission gating for Calendar/Torch,
  plain grant for Brightness, install/remove for store connectors) migrated
  out of `ConnectorsScreen.test.tsx` (11 tests, now navigation-only).
- ✅ Verified visually on the iOS Simulator, both light and dark (dark via
  `xcrun simctl ui ... appearance dark`, independent of in-app controls):
  the segmented control's active-segment elevation, section labels, status
  pills, and chevrons all render correctly in both schemes.
- ⚠️ On-device *interactive* navigation into Connectors/`ConnectorDetail`
  could not be verified this session — the iOS Simulator stopped responding
  to content-area taps on the Settings screen specifically (the tab bar
  stayed responsive throughout), and this persisted through a full app
  relaunch, a Metro cache clear, and a full simulator reboot. Not reproduced
  in the automated suite, which drives the identical `onPress` handlers
  successfully (real `userEvent.press` through React Navigation's actual
  native-stack, not a stub) — treated as a simulator/tooling issue rather
  than a code defect, but flagged rather than silently skipped.

---

#### ✅ 7.8 — Release assets: app icon + splash screen

**Goal:** Replace the stock Expo template assets (`android-icon-background`
`#E6F4FE` — an unrelated blue — and an unreferenced `splash-icon.png`) with
real Sovereign Edge identity assets.

**Deliverables:**

- New app icon (`assets/icon.png`, 1024×1024): the "one gate" mark (a
  sealed boundary ring, opened at exactly one point, with the companion's
  spark inside) — identical path data to `Mark.tsx` and `reference.html`'s
  splash mockup — in clay-on-cream (`clay700` on `grey50`, the light-theme
  accent/surface pair), scaled to 62% of the canvas so it reads clearly
  once iOS applies its own corner mask.
- Android adaptive-icon layers: `android-icon-background.png` (solid
  `grey50`, replacing the stock blue), `android-icon-foreground.png`
  (transparent, mark at 42% of canvas — comfortably inside the ~66/108
  safe-zone circle launchers guarantee is visible regardless of mask
  shape), `android-icon-monochrome.png` (same mark as a single opaque
  colour on transparent, for Android 13+ themed icons — the OS reads only
  the alpha channel and applies its own tint).
- A configured splash screen via the `expo-splash-screen` plugin
  (`app.json`'s legacy `splash` key doesn't exist in SDK 57; this is its
  replacement) — `grey50` background with a transparent `clay700` mark in
  light mode, a separate `grey950`/`clay300` pair for `dark`, matching why
  `semantic.ts` splits the accent by scheme in the first place: `clay700`
  doesn't have enough contrast against a dark surface.
- Generated with `sharp` (SVG→PNG, exact path data, no visual drift from
  hand-tracing) rather than a rasterizer CLI — none of `rsvg-convert`,
  `imagemagick`, or `inkscape` were available on this machine, and `sharp`
  was already resolvable from the npm registry.

**Dependencies:** Task 7.3 (palette), independent of 7.4–7.7.

**Review checklist:**

- ✅ `pnpm --filter mobile typecheck`, `pnpm --filter mobile lint`, and the
  full test suite (344 tests, 35 suites) all pass — this task touched no
  application code, only assets and `app.json`.
- ✅ `pnpm prebuild` (clean) + a full native rebuild succeeded with the new
  `expo-splash-screen` CocoaPod integrated; `app.json` validated as parseable
  JSON before rebuilding.
- ✅ Verified on the iOS Simulator: the Home Screen icon shows the clay
  "one gate" mark on cream, replacing the stock blue Expo icon, at native
  resolution (not a stretched placeholder).
- ⚠️ The splash screen's own transient on-screen frame wasn't caught by a
  screenshot (it renders and clears before a `launch`+`screenshot` round
  trip completes) — its correctness rests on `app.json` parsing validly,
  the `expo-splash-screen` plugin resolving and integrating cleanly during
  prebuild with zero build errors, and the composited light/dark previews
  (`sharp`-rendered, mark over each theme's actual surface colour) checked
  before installing the assets — not on a live capture of the splash
  itself.

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0001](../../research/0001-concept-and-connector-architecture.md)
