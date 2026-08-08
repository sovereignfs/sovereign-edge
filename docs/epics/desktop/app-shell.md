---
epic: 13
title: Desktop App Shell
status: "⏳ In Progress — task 13.1 done"
scope: desktop
---

# Epic: Desktop App Shell

> Real navigation, a model manager screen, a connectors/permissions screen,
> and general settings — the desktop equivalent of
> [Mobile App Shell](../mobile/mobile-app-shell.md) (epic 8), extracted from
> what task 12.7's single chat screen currently does inline.

## Overview

[Desktop Core Port](core-port.md) (epic 12) deliberately deferred this:
"a full desktop app shell — navigation, settings screens, per-connector
permission UI — the desktop equivalent of Mobile App Shell (epic 8)... its
own epic once there's a reason to build it, not invented speculatively
here." Epic 12 is now done, and `apps/desktop/src/chat/ChatScreen.tsx`
(task 12.7) is the reason: it already has a working model picker (install/
load, folded into a `ListItem` list in its own header) and connector consent
(a single `Toggle` next to the one Search connector's `ListItem`) — both
built as the minimum inline UI needed to satisfy task 12.7's own review
checklist, explicitly not as the real thing. This epic builds the real
thing and moves that logic into it.

**This is UI work on top of an already-proven backend, not new backend
work.** Every piece of state this epic's screens need already exists and
is already tested: `secure_storage::vault` (task 12.3, isolation proven
on-device), `connectors::permissions::grants` (task 12.4, the grant/revoke
state machine, mock- and real-backend tested), `models::ModelManager`
(task 12.2), and the `connector_status`/`set_search_connector_granted`/
`list_models`/`install_model`/`load_model`/`remove_model` Tauri commands
already registered and ACL-gated. Where a task below needs a new command
(none currently anticipated — `remove_model` exists but has no UI caller
yet), that's called out explicitly in its own deliverables, the same "added
because the checklist needs it, not speculatively" discipline task 12.7
followed for `connector_status`.

**Task breakdown below mirrors [Desktop Core Port](core-port.md)'s own
granularity** (small, independently reviewable tasks per its own review
checklist) rather than [Mobile App Shell](../mobile/mobile-app-shell.md)'s
coarser two-task shape — that epic bundled navigation and every screen into
one task (8.1) because nothing existed yet to extract from; here, the
opposite is true: real, working, already-reviewed logic exists inline in
one file and needs to be pulled apart, which is naturally several smaller,
separately-verifiable steps.

**Deliberately out of scope:** store/distribution release setup (code
signing, notarization, an installer or update mechanism) — the desktop
equivalent of mobile's own task 8.2, and just as clearly a distinct
concern from the screens themselves. Desktop currently ships only as a
local debug binary (`cargo build`, `scripts/ci/launch-smoke.js`); nothing
about *how the app reaches a user's machine* is decided yet, and deciding
it isn't this epic's job. A future epic once there's a reason to build it,
same call core-port.md made about this epic before it existed.

## Tasks

#### ✅ 13.1 — Navigation shell scaffold

**Goal:** The chrome and route structure every other screen in this epic
plugs into — mirrors mobile task 8.1's own framing ("the screens and
navigation structure everything else plugs into"), scoped down to just the
scaffold since desktop's screens land as their own separate tasks below.

**Deliverables:**

- Navigation chrome (a sidebar or tab strip — not decided here; this task's
  own implementation call, the same way task 12.2 left the `llama.cpp`
  crate choice to its own implementation rather than deciding it in
  advance) with at least four destinations: Chat, Models, Connectors,
  Settings.
- No new routing-library dependency unless a real need surfaces — this
  app has four flat, non-nested destinations and no deep-linking
  requirement yet; component-level state (`useState`, matching
  `ChatScreen.tsx`'s own existing pattern) may well be enough, the same
  "don't add a dependency the task doesn't need" call task 12.6 made about
  a styling library.
- `ChatScreen.tsx`'s content moves behind the "Chat" destination unchanged
  in behavior — this task is pure scaffolding, not a rewrite of chat
  itself.

**Dependencies:** Task 12.6 (`desktop-ui`), Task 12.7 (the chat screen this
extracts navigation out of).

**Review checklist:**

- All four destinations are reachable and render without a console error;
  navigation chrome follows the theme in both light and dark
  (`ThemeProvider`'s existing `system`/`light`/`dark` preference, unused by
  any UI today — task 13.4's job to expose, but the chrome itself must
  already respect the resolved theme). Chat is the default destination.
  Verified in a real browser via the Vite dev server (same honest-gap
  caveat every desktop UI task since 12.5 has carried: this environment
  cannot drive the actual native Tauri window).

**Decided: `useState`, no routing library, a left sidebar.**
`apps/desktop/src/shell/AppShell.tsx` holds a plain `Destination` union
(`'chat' | 'models' | 'connectors' | 'settings'`) in component state and
switches between the four screen components directly — four flat
destinations with no deep-linking need didn't justify a router dependency.
`ModelsScreen`/`ConnectorsScreen`/`SettingsScreen` ship as real, honest
empty states (mirroring mobile task 8.1's own Connectors screen shipping
empty until its data existed) rather than placeholders that reference task
numbers in their copy.

**A real, on-device-only bug this task's own review checklist caught:**
the three new placeholder screens rendered in the browser's default black
serif font, unreadably dark-on-dark — `ChatScreen.tsx` sets
`color`/`fontFamily` on its own root element, but nothing did that for the
shell as a whole, and CSS `color`/`font-family` only inherit from an
ancestor that actually sets them, not from `ThemeProvider`'s CSS custom
properties existing somewhere in the tree. Fixed by setting
`background`/`color`/`fontFamily` on `AppShell`'s own root element, so
every screen inherits it — a real defect a `tsc`/`eslint` pass could not
have caught, only visible by actually looking at the rendered page.

**Verified:** `pnpm --filter desktop exec tsc --noEmit` / `eslint .` /
`prettier --check` clean. Real Vite dev server viewed in a real browser:
all four destinations reachable via `ref`-targeted clicks (not raw screen
coordinates — a first attempt at clicking by pixel position landed on the
wrong nav item, a tool-usage mismatch between screenshot and viewport
scaling, not an app bug), correct `aria-current="page"` on the active item,
a `nav[aria-label="Main"]` landmark, correct light/dark theming after the
fix above, zero console errors, and Chat still the default destination
with its own behavior unchanged.

---

#### 📋 13.2 — Model manager screen

**Goal:** A real model manager, mirroring mobile's `ModelsScreen.tsx` —
`ChatScreen.tsx`'s current model picker only supports install-then-load; it
has no download-progress UI, no way to see a model's fit assessment beyond
one line, and no way to remove an installed model, even though
`remove_model` is already a registered, ACL-gated command with no UI
caller.

**Deliverables:**

- A "Models" screen: one row per catalog entry (`ListItem`, per
  `packages/desktop-ui`), each showing size, parameter count, and the
  device fit note (`ManagedModel.fit`, already returned by `list_models`),
  with a status accessory (`DOWNLOAD` / `DOWNLOADING <progress>` /
  `INSTALLED` / `IN USE` / `REMOVE`) mirroring mobile's own badge set.
- Real download-progress UI, wired to the `download-progress` event
  `install_model` already emits (`apps/desktop/src/lib/tauri.ts` already
  types `DownloadProgress`/`onDownloadProgress`; task 12.7 added the
  wrapper but nothing calls it yet).
- A remove action wired to the existing `remove_model` command.

**Dependencies:** Task 13.1.

**Review checklist:**

- Installing a model shows real progress (not just a static "preparing"
  label — `ChatScreen.tsx`'s current gap), removing an installed model
  actually deletes it on disk and the screen reflects that without a
  manual refresh, and switching the active model updates what Chat uses on
  the next message — the same end-to-end bar task 12.7's own review
  checklist set for the model picker it's replacing, now with removal
  added.

---

#### 📋 13.3 — Connectors & permissions screen

**Goal:** A real settings surface listing every installed connector and its
permission state, mirroring mobile task 2.2's own deliverable
("A settings surface listing every installed connector and its current
permission state") — `ChatScreen.tsx`'s current connector UI is a single
hardcoded `Toggle` for the one Search connector, not a list, because that
was as much as task 12.7's own checklist needed.

**Deliverables:**

- A "Connectors" screen: one row per known connector manifest (today, just
  the embedded Search fixture — `connectors::manifest::fixtures::
  SEARCH_MANIFEST_JSON`, the same one `connector_status`/
  `set_search_connector_granted` already read) with its granted/not-granted
  state and a grant/revoke control.
- Built as a real list against however many connectors exist, not a
  single hardcoded row — so the screen doesn't need rewriting when a
  second connector eventually ships (out of this epic's scope to add one);
  the honest scope limit is that today it will only ever render one row.
- **Only a new command if one is actually needed:** `connector_status`
  currently hardcodes the Search fixture; whether this screen needs a
  `list_connectors`-shaped command or can keep calling per-connector
  status is this task's own implementation call, not decided here.

**Dependencies:** Task 13.1, Task 12.4 (`connectors::permissions` — the
grant/revoke backend already exists and is already tested; this task is UI
only).

**Review checklist:**

- Revoking a connector's permission from this screen actually clears its
  stored credentials (task 12.4's `revoke()`, not just a UI-local toggle)
  and the change is immediately reflected in Chat's own connector toggle —
  the desktop equivalent of mobile task 2.2's own bar, minus the
  two-connectors-sharing-a-credential-key adversarial case, since desktop
  still has only one connector to test against; revisit that specific case
  once a second connector exists.

---

#### 📋 13.4 — General settings screen

**Goal:** Somewhere for app-level preferences to live, starting with the
one that already exists in code but has no UI: theme preference.

**Deliverables:**

- A "Settings" screen exposing `useThemePreference()`'s `system`/`light`/
  `dark` choice (`packages/desktop-ui`'s `ThemeProvider`, built in task
  12.6, never wired to any control since) as a real, mutually-exclusive
  control — not three independent toggles, the exact "reads oddly" gap
  mobile task 8.1 flagged and left open in its own equivalent screen.
- App version/build info, since it costs nothing once the screen exists
  and is the other thing "general settings" conventionally holds.

**Dependencies:** Task 13.1.

**Review checklist:**

- Switching the preference actually changes every screen's theme live (not
  just Settings' own), and `system` actually tracks the OS preference
  (`ThemeProvider`'s existing `matchMedia` listener) rather than freezing
  at whatever it resolved to on first render.

---

#### 📋 13.5 — Chat screen consolidation

**Goal:** Close the loop — once 13.2–13.4 exist, `ChatScreen.tsx` goes back
to being just chat, and the whole shell gets exercised together for real,
not screen by screen.

**Deliverables:**

- Remove the inline model-picker `ListItem` list and the inline connector
  `Toggle` from `ChatScreen.tsx`; replace with a compact "active model"
  indicator (name, tap-through to Models) and a compact connector-mode
  indicator (tap-through to Connectors) — mirroring how mobile's own
  `ChatScreen.tsx` stays chat-only and defers model/connector management to
  its own screens entirely.
- No behavior change to message send/stream/connector-tagging itself —
  this task is subtraction and a navigation hookup, not a chat-logic
  rewrite.

**Dependencies:** Tasks 13.1, 13.2, 13.3, 13.4 (all screens this task links
out to must exist first).

**Review checklist:**

- The exact bar task 12.7 already cleared, re-verified through real
  navigation instead of one flat screen: a fully offline conversation
  works end to end with no connector granted, and a granted Tier 1
  connector answers and is visibly marked as having done so — now reached
  by navigating from Chat to Models to install/load a model, to Connectors
  to grant Search, and back to Chat to send a message, not by everything
  already being on one screen.

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0001](../../research/0001-concept-and-connector-architecture.md)
- [Desktop Core Port](core-port.md) (epic 12) — the backend and the interim
  single-screen chat UI this epic builds real navigation and screens on top
  of, without changing.
- [Mobile App Shell](../mobile/mobile-app-shell.md) (epic 8) — the mobile
  epic this one mirrors in role.
- [Connector Framework](../mobile/connector-framework.md) (epic 2),
  specifically task 2.2 — the permission/consent UI task 13.3 mirrors.
