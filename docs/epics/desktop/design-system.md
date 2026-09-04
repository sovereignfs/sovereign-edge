---
epic: 15
title: Design System & Branding (Desktop)
status: "✅ Complete"
scope: desktop
---

# Epic: Design System & Branding (Desktop)

> The desktop equivalent of [Design System & Branding](../mobile/design-system.md)
> (epic 7) — the same warm cream/clay identity, icon system, and screen
> redesigns, ported to `apps/desktop` instead of `apps/mobile`.

## Overview

Epic 7 ported `packages/design-tokens/reference.html`'s warm cream/clay
visual identity into the mobile app: palette/typography, a curated Lucide
icon system, redesigned Chat/Models/Settings/Connectors screens (sections,
status pills, a real segmented control, a unified connector-detail screen),
and new release assets (app icon + splash screen) using a hand-coded "one
gate" mark SVG.

`packages/desktop-ui/ThemeProvider.tsx` already imports its tokens from the
same shared `design-tokens` package epic 7 repointed at the warm palette —
so the base colour/typography layer already reached desktop for free, no
task needed for it. Everything past that — icons, section/pill/segmented-
control chrome, the unified connector-detail screen, release assets — is
still at pre-epic-7 shape on desktop and is this epic's scope.

`reference.html` already mocks up every desktop screen this needs
(`#dscreen-chat`, `#dscreen-models`, `#dscreen-connectors`,
`#dscreen-connector-detail`, `#dscreen-settings`), using the identical
Lucide-style stroke-icon convention and the same "one gate" mark path data
mobile's `Mark.tsx` uses — that file is the literal spec here too.

**Versioning note:** unlike mobile's per-task version-bump convention,
desktop's `package.json`/`Cargo.toml`/`tauri.conf.json` version is bumped
only by `apps/desktop/scripts/bump-version.mjs` (task 14.4's release tool,
which commits/tags/pushes) — ROADMAP.md's desktop rows already use `—`
instead of a version number for this reason, and this epic's rows do too.

## Tasks

#### ✅ 15.1 — Icon system

**Goal:** Give `desktop-ui` a curated icon set and the app mark, mirroring
mobile task 7.4.

**Deliverables:**

- `lucide-react` (the DOM equivalent of `lucide-react-native`, same version
  1.31.0) as a dependency of `packages/desktop-ui`.
- A curated `Icon` component (`packages/desktop-ui/components/Icon.tsx`)
  mirroring mobile's own `<Icon name size color aria-hidden|aria-label>`
  contract and `iconSize` token binding — `color` defaults to
  `currentColor` here (unlike mobile's required prop), since the DOM's SVG
  renderer, unlike React Native's, does inherit a surrounding element's
  `color`.
- A `Mark` component (`packages/desktop-ui/components/Mark.tsx`) — the same
  "one gate" path data as `apps/mobile/src/design-system/components/
  Mark.tsx`, for the connector-provenance glyph (used starting task 15.2).
- `apps/desktop/src/shell/AppShell.tsx`'s four sidebar destinations wired
  to real icons: `message-circle`/Chat, `cpu`/Models, `settings`/Settings,
  and the `Mark` itself (not a generic Lucide glyph) for Connectors —
  matching `reference.html`'s own desktop sidebar mockup, which ties the
  connector concept back to the mark's own motif rather than a generic
  plug/link icon.

**Dependencies:** None (desktop-ui's token layer already carries the
palette).

**Review checklist:**

- ✅ `pnpm --filter desktop-ui typecheck`, `pnpm --filter desktop
  typecheck`, `pnpm --filter desktop lint`, and the full test suite (53
  tests, 8 files) all pass.
- ✅ Verified in a browser against the app's own Vite dev server (port
  1420, same content a Tauri window loads), both light and dark: all four
  sidebar icons render at the correct size, the active destination's
  accent colour applies to its icon via `currentColor` with no per-row
  colour prop needed, and navigating between destinations (confirmed via
  Connectors) works correctly with the `Mark` rendering correctly in its
  active state too.

---

#### ✅ 15.2 — Chat screen: icons, provenance receipts, multiline composer

**Goal:** Bring `ChatScreen.tsx` up to `reference.html`'s `#dscreen-chat`
mockup.

**Deliverables:**

- Circular icon send/stop button (a local `ComposerButton`, matching
  mobile's own local-not-shared pattern for this), replacing the
  full-width text `Button` — same `aria-label`s ("Send"/"Stop") as before,
  so no existing test needed to change.
- `ChatBubble`'s connector receipt restructured from inline `via {name}`
  text inside the bubble to a separate row below it using the new `Mark`
  glyph — the same restructure mobile's task 7.5 made, `packages/
  desktop-ui/components/ChatBubble.tsx` now mirroring `apps/mobile/src/
  design-system/components/ChatBubble.tsx`'s shape.
- `ModeBar.tsx` chips gain icons alongside their existing labels, via a
  `MODE_ICON` map identical to mobile's own (task 7.5) — same icon per
  concept on both platforms, not a per-platform reinterpretation.
  (`reference.html`'s own desktop mockup draws Brainstorm with a pencil
  icon rather than a lightbulb; mobile's already-shipped choice was
  treated as the more deliberate, finalized decision to mirror.)
- Composer becomes a real auto-growing `<textarea>`, capped at
  `touchTargetMin * 3` before scrolling internally — `reference.html`'s
  own desktop mockup uses a static `rows="2"` textarea with no growth
  behavior at all, but mobile's already-proven "grows then caps" composer
  was judged the more faithful thing to mirror; growth is JS-driven
  (`scrollHeight` measured into an explicit `height` on every keystroke),
  since a plain HTML `<textarea>` does not do this on its own the way
  RN's `TextInput` does.
- The risky-model warning banner also gains an `alert-triangle` icon,
  matching mobile's own iconified warning banner.

**Dependencies:** Task 15.1.

**Review checklist:**

- ✅ `pnpm --filter desktop-ui typecheck`, `pnpm --filter desktop
  typecheck`, `pnpm --filter desktop lint`, and the full test suite (53
  tests, 8 files) all pass unchanged — every existing query in
  `ChatScreen.test.tsx`/`ModeBar.test.tsx` targets `role`/`aria-label`,
  none of which changed, so no test needed editing for this task.
- ✅ Verified in a browser against the app's own Vite dev server, both
  light and dark: mode chip icons, the circular send button, and the
  connector receipt's `Mark` glyph all render correctly. The composer's
  grow-then-cap-then-scroll behavior was verified by scripting real input
  events into the `<textarea>` (bypassing its `disabled` state, which
  needs a live Tauri backend/loaded model this browser-only preview
  doesn't have) and reading back `scrollHeight`/`clientHeight`: growth
  confirmed up to the cap, then `scrollHeight` (214px) exceeding
  `clientHeight` (130px ≈ the 132px cap) confirmed the internal-scroll
  hand-off engages correctly past it.
- ⚠️ The composer's real `disabled`/model-loaded gating and the actual
  send→reply round trip were not exercised end-to-end — this browser-only
  Vite preview has no Tauri IPC backend behind it (no native window
  available to drive interactively in this environment). Covered instead
  by the existing, unchanged `ChatScreen.test.tsx` suite, which drives the
  real `send()`/`stop()` handlers against a mocked `lib/tauri` backend.

---

#### ✅ 15.3 — Models screen: sections, progress bar, fit badge

**Goal:** Bring `ModelsScreen.tsx` up to `reference.html`'s `#dscreen-models`
mockup.

**Deliverables:**

- Installed/Available section split, using a new `SectionLabel` component
  (`packages/desktop-ui`) — same uppercase-via-JS treatment as mobile's own
  `SectionLabel` (task 7.6), not `reference.html`'s literal sentence-case
  CSS, for the same "mirror mobile's shipped decision" reasoning task 15.2
  already used for icon choices.
- A new `ProgressBar` component (`role="progressbar"`, `aria-value*`)
  renders during an active download, replacing the inline percentage/byte-
  count text — the byte-count stays in the subtitle since the badge and
  bar already cover the percentage.
- A new `FitBadge` component (good/tight/bad/neutral, same variant name
  and colour mapping as mobile's own — `packages/desktop-ui` and
  `apps/mobile/src/design-system` now agree on this vocabulary) replaces
  the mono-coloured accessory text everywhere: install state (`Download`/
  `Installed`/`In use`), transfer state (percentage/`Verifying`/`Retry`),
  and refusal (`Too large`, colour-coded red rather than an accent-styled
  "download anyway"). The badge now names a *status*; the action it
  implies moved into the subtitle (e.g. "click to download anyway").
- `ListItem` gained an optional `footer` slot (content below the subtitle,
  in the same column) so the progress bar can render without overlapping
  the badge — same addition mobile's own `ListItem` got in task 7.6.

**Dependencies:** Task 15.1.

**Review checklist:**

- ✅ `pnpm --filter desktop-ui typecheck`, `pnpm --filter desktop
  typecheck`, `pnpm --filter desktop lint`, and the full test suite (54
  tests, 8 files) all pass. Tests that asserted on the old uppercase mono
  labels (`DOWNLOAD`, `IN USE`, `INSTALLED`, `RETRY`, `CANCEL`) switched to
  the new sentence-case badge text; the `CANCEL` accessory (now a live
  percentage badge) is asserted via the same placeholder (`…`) the
  subtitle's own unknown-total fallback already used; one new test covers
  the Installed/Available section split.
- ✅ Verified visually against the app's own Vite dev server, both light
  and dark: since this browser-only preview has no Tauri backend behind
  it (`listModels()`/`activeModelId()` reject with nothing to render),
  verification used temporarily seeded fixture data covering all four
  badge variants and an in-progress download at once (installed/active,
  downloading at 67%, available/comfortable, available/unsupported) —
  confirmed section split, progress bar fill, and all four `FitBadge`
  colours render correctly in both schemes, then reverted the fixture
  data before finalizing.

---

#### ✅ 15.4 — Settings segmented control + Connectors restructure

**Goal:** Fix the same two structural gaps mobile task 7.7 fixed: the
theme picker's plain-button `role="radiogroup"` (Settings and Search
setup both use this pattern), and Connectors having no section headers or
per-connector detail screen.

**Deliverables:**

- A new `SegmentedControl` component (`packages/desktop-ui`), replacing the
  plain-button radiogroup in both `SettingsScreen.tsx`'s theme picker and
  the Search provider picker. `SettingsScreen.tsx` also gained
  `SectionLabel`s (Appearance/Privacy/About) and a chevron on its
  Connectors row, mirroring the same section treatment task 15.3 gave
  Models.
- Connectors gains section headers (`SectionLabel`: Search/Calendar/
  Installed — desktop has no Device tier, unlike mobile) and status
  `FitBadge`s (`Allowed`/`Not granted`/`Not set up`), replacing the flat
  `Toggle`-per-row list with rows that navigate into an inline connector
  detail view (grant/revoke, and — for store-installed connectors only —
  remove) built inside `ConnectorsScreen.tsx` itself, using the same
  list/detail-toggle-in-one-file pattern `ConnectorStoreScreen.tsx` already
  established, rather than a new `AppShell` destination.
- `SearchSetupScreen.tsx` folded into `ConnectorsScreen.tsx`'s own
  `SearchDetail` sub-view (its own file and test deleted); Search keeps its
  "reconfigure, no remove" treatment since it's built into the app, not
  store-installed.
- Calendar connectors keep task 10.2's real-OS-permission gate: granting
  calls `requestCalendarAccess()` first and only proceeds to
  `setConnectorGranted` on success; revoking never re-requests OS access.
- **Scope reduction, stated explicitly rather than left implicit:** unlike
  mobile's manifest-based connectors, desktop's `ConnectorStatus` DTO is
  `{ id, name, granted }` only — no scope/origin data crosses the IPC
  boundary for installed connectors. Desktop's connector detail views
  therefore have no "Reaches" section (mobile's does); this is a real
  backend API gap the frontend can't paper over, not an oversight, and is
  left for a future task if scope display is wanted here.

**Dependencies:** Tasks 15.1, 15.3 (reuses `SectionLabel`/`FitBadge`).

**Review checklist:**

- ✅ `pnpm --filter desktop-ui typecheck`, `pnpm --filter desktop
  typecheck`, `pnpm --filter desktop lint`, and the full test suite (48
  tests, 7 files) all pass — `SearchSetupScreen.test.tsx`'s cases moved
  into `ConnectorsScreen.test.tsx` (12 tests covering empty/configured
  Search, section pills, store-installed Remove, and all three Calendar
  OS-permission-gate cases), `SettingsScreen.test.tsx`'s 7 existing tests
  pass unchanged against the new `SegmentedControl` markup.
- ✅ Verified visually against the app's own Vite dev server, both light
  and dark: since this browser-only preview has no Tauri backend behind it
  (`listConnectors()` never resolves), verification used temporarily
  seeded fixture data (four connectors spanning Search/Calendar/Installed,
  granted and not-granted) — confirmed the sectioned list (pills, chevrons),
  the Search detail view (Allowed pill, Revoke, provider
  `SegmentedControl`, Instance URL field, Save), the store-installed
  detail view (Revoke + Remove), and the not-granted Calendar detail view
  (neutral "Not granted" pill, accent "Grant access" button, no Remove)
  all render correctly in both colour schemes — then reverted the fixture
  data before finalizing, same as task 15.3.

---

#### ✅ 15.5 — Release assets: app icon + splash window

> **The splash window described here no longer exists.** It shipped as
> described, then was removed wholesale in `c13ddf1` — `public/
> splashscreen.html`, the `splashscreen` window in `tauri.conf.json`, the
> `show_main_window` command (with its `build.rs` `COMMANDS` entry and
> `capabilities/default.json` permission), and `App.tsx`'s first-mount
> `useEffect` are all gone, and `main` no longer starts `visible: false`.
> The reason is the risk the last checklist item below flagged and could
> not test here: the hand-off got stuck on the splash indefinitely on a
> real Tauri runtime. Deleting it was judged simpler than debugging it,
> and opening straight to the main window matches the reference product.
> That commit also added the `core:window:allow-start-dragging` capability
> the custom titlebar's drag region had always been missing.
>
> The task stays ✅ because both halves did ship and were reviewed; the
> icon half is still live. Nothing here is a regression to fix — this note
> exists so the deliverables below aren't read as a description of the
> current code.

**Goal:** Replace the stock Tauri template icon with the "one gate" mark,
and add a real splash window covering the gap before the app's first paint.

**Deliverables:**

- `apps/desktop/src-tauri/icons/*` regenerated via `pnpm tauri icon
  ../mobile/assets/icon.png` — the workflow `apps/desktop/AGENTS.md`
  already documents. That command's default output also includes iOS/
  Android/Windows-Store-tile assets this desktop-only bundle doesn't use
  (not referenced by `tauri.conf.json`'s `bundle.icon` or `bundle.targets`,
  and absent from the original `tauri init` scaffold) — deleted after
  generation rather than committed as unused cruft; only the same 7 files
  the scaffold originally tracked were kept, now regenerated with the mark.
- A second `tauri.conf.json` window (`splashscreen`: transparent,
  undecorated, centered, `skipTaskbar`) showing a static
  `apps/desktop/public/splashscreen.html` with the inline mark SVG and a
  `prefers-color-scheme` media query, using the same light/dark colour
  pairs mobile's splash screen used (`grey50`/`clay700` light,
  `grey950`/`clay300` dark) — hardcoded in the HTML rather than read from
  CSS vars, since this window never mounts `ThemeProvider` or any app JS.
  Lives in `public/` (Vite's static-asset convention) rather than a page
  Vite processes, so it needs no bundler entry of its own and resolves
  identically in dev (served at `/splashscreen.html` by the same Vite dev
  server) and in a production build (copied into `dist/` verbatim).
- `main` window starts `"visible": false`; a new `show_main_window` Tauri
  command (registered in `lib.rs`'s `invoke_handler!` *and* `build.rs`'s
  `COMMANDS` list — the latter is what actually makes the
  `allow-show-main-window` permission this command's `capabilities/
  default.json` entry names exist at all; missing it fails the Rust build
  itself with "Permission ... not found", not a silent gap, per
  `build.rs`'s own doc comment) that `App.tsx` invokes once, in a
  first-mount `useEffect`, to show `main` and close `splashscreen`. Looked
  up by label via `get_webview_window`, which returns `None` rather than
  panicking on a missing label, so React 19 `StrictMode`'s dev-only double
  effect invocation (a second, harmless call after `splashscreen` is
  already closed) is not a bug to guard against.

**Dependencies:** None (independent of 15.1–15.4, same as mobile 7.8 was
independent of 7.4–7.7).

**Review checklist:**

- ✅ `pnpm --filter desktop typecheck`, `pnpm --filter desktop lint`, and
  the full test suite (48 tests, 7 files) pass. On the Rust side:
  `cargo check`, `cargo test --lib` (150 tests) and `cargo test` (every
  target), `cargo clippy --all-targets -- -D warnings`, and `cargo fmt
  --check` all clean in `src-tauri/`.
- ✅ Regenerated `icon.png` visually confirmed against the prior stock
  Tauri gradient placeholder — now the "one gate" mark on a cream
  background, matching `apps/mobile/assets/icon.png` exactly (same source
  file).
- ✅ `splashscreen.html` verified directly in a browser (no Tauri backend
  needed for a static file) in both colour schemes: light shows the clay
  mark on a cream background, dark shows the lighter clay tint on a
  near-black background, matching mobile's own splash colour pairs.
- ⚠️ The actual windowed hand-off — `main` starting hidden, the splash
  window appearing first, and `show_main_window` closing it after React's
  first paint — was not exercised end-to-end in this environment (no
  Tauri runtime/native window available here, only the browser-only Vite
  preview used for every other visual check in this epic). Covered instead
  by: `cargo check`/`clippy`/`fmt` confirming the Rust side (window
  lookup-by-label, command registration, capability wiring) is correct: and
  a manual review of `tauri.conf.json`'s window config against Tauri v2's
  own schema (`src-tauri/gen/schemas/*.json`), which `cargo check` already
  validates by deserializing it at build time. A real `pnpm tauri dev` /
  `pnpm tauri build` launch to watch the hand-off with your own eyes is the
  one verification step this task couldn't do here. **This is exactly where
  it broke** — that launch, once someone did it, showed the app stuck on the
  splash; see the note under this task's heading. A worked example of why
  "the Rust compiles and the config validates" is not the same claim as
  "the window hand-off works."

## Related Docs

- [Mobile Design System & Branding](../mobile/design-system.md) (epic 7 —
  the completed mobile counterpart this epic mirrors)
- [packages/design-tokens/reference.html](../../../packages/design-tokens/reference.html)
