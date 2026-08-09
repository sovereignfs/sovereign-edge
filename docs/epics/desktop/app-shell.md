---
epic: 13
title: Desktop App Shell
status: "✅ Done — tasks 13.1–13.10 all done"
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

#### ✅ 13.2 — Model manager screen

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

**Decided: exact tap-dispatch parity with mobile, minus cancel.**
`apps/desktop/src/models/ModelsScreen.tsx` mirrors
`apps/mobile/src/models/screens/ModelsScreen.tsx` precisely — not
installed → install; installed and active → remove; installed and not
active → activate — including the "the subtitle says in words what
clicking will do" rule and the same accessory label set (`DOWNLOAD` /
`DOWNLOAD ANYWAY` / `DOWNLOADING` / `VERIFYING` / `RETRY` / `INSTALLED` /
`IN USE`), plus `ListItem`'s `destructive` styling on a failed download,
same as mobile. **Deliberate gap, not an oversight:** mobile's row also
cancels an in-flight download on tap; desktop's `install_model` command has
no cancellation wired up (`DownloadOptions.cancel` is hardcoded `None` in
`lib.rs`), and wiring one is backend work outside this task's own stated
deliverables — a downloading row is read-only (progress, no click action)
rather than silently pretending to support cancel. `apps/desktop/src/lib/
tauri.ts` gained `removeModel` and `onDownloadPhase` (mirrors the
already-emitted-but-unconsumed `download-phase` event, distinct from
`download-progress`). `ChatScreen.tsx` keeps its own inline model picker
unchanged — task 13.5 removes it once this screen is the real thing.

**Verified:** `tsc --noEmit`/`eslint`/`prettier --check` clean. Real Vite
dev server viewed in a real browser: Models reachable, correct empty/
loading rendering, zero console errors. `cargo build` and
`scripts/ci/launch-smoke.js` re-run to confirm the (unchanged) Rust side —
`remove_model` was already a registered, ACL-gated command from task 12.7 —
still builds and launches cleanly. **Honest gap, same as every desktop UI
task since 12.5:** this environment cannot drive the actual native Tauri
window, so a real install → activate → remove round trip through the
rendered UI was not exercised by hand; the commands themselves
(`install_model`/`load_model`/`remove_model`) were already proven on-device
by earlier tasks (12.2's `engine_smoke.rs`, `ModelManager`'s own release-
before-delete behavior in `manager.rs`), so the incremental risk here is
the UI wiring, not the underlying operations.

---

#### ✅ 13.3 — Connectors & permissions screen

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

**Decided: a new, generic `list_connectors`/`set_connector_granted` pair,
`connector_status`/`set_search_connector_granted` untouched.** Both new
commands are built against a `known_connector_manifests()` helper
(today: `vec![search_connector_manifest()]`) so the screen and any future
caller share one list to extend as connectors are added, rather than one
per command. `connector_status`/`set_search_connector_granted` — task
12.7's original single-connector lever for `ChatScreen.tsx`'s own inline
`Toggle` — are deliberately left as-is rather than rewritten to fit the
list shape: task 13.5 removes that inline control and switches Chat to
linking out to this screen, so two small commands until then is less risk
than reworking a working, already-verified one. Both old and new commands
now share a `connector_status_for()` helper internally, so there's no
duplicated grant-status logic even though the public commands stayed
separate. `apps/desktop/src/connectors/ConnectorsScreen.tsx` renders one
`ListItem` + `Toggle` per entry from `list_connectors`, with an optimistic
UI flip on toggle that reverts if the write fails — mirrors
`ChatScreen.tsx`'s own toggle-failure handling.

**Verified:** `cargo fmt --check` / `cargo clippy --all-targets -- -D
warnings` / `cargo test --lib` (62 tests, unaffected — no logic changed,
only two new thin commands atop already-tested `connectors::permissions`)
clean; `cargo build` succeeds (confirms the new commands' ACL permissions
are consistent). `tsc --noEmit`/`eslint`/`prettier --check` clean. Real
Vite dev server viewed in a real browser: Connectors reachable, correct
rendering, zero console errors. `scripts/ci/launch-smoke.js` re-run against
the freshly built binary — still launches cleanly with all 16 commands
registered and ACL-gated. **Honest gap, same as every desktop UI task since
12.5:** this environment cannot drive the actual native Tauri window, so a
real grant → revoke round trip through the rendered UI, and confirming
Chat's own toggle picks up the change on next visit (it remounts and
refetches on every navigation, per `AppShell`'s conditional rendering —
not a live subscription, but no state to go stale between visits either),
were not exercised by hand. `revoke()`'s actual credential-clearing
behavior was already proven by task 12.4's own tests; this task adds no
new permission logic, only a real list in front of what already existed.

---

#### ✅ 13.4 — General settings screen

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

**Decided: a plain `role="radiogroup"`, no new `desktop-ui` component.**
`packages/desktop-ui` still has no dedicated radio-group component —
`apps/desktop/src/settings/SettingsScreen.tsx` builds one from three
styled `<button role="radio">`s, the same "no new component for one
screen" call `AppShell.tsx`'s own nav buttons already made. No new state
to manage or propagate: `useThemePreference()` reads/writes the same
`ThemeProvider` context every screen already renders under (`App.tsx`
wraps `AppShell`, not each screen individually), so a change is live
everywhere immediately, for free. App version comes from
`@tauri-apps/api/app`'s `getVersion()` — a real Tauri core API, not
invented — which needed a new capability permission,
`core:app:allow-version` (confirmed via the actual generated
`gen/schemas/desktop-schema.json`, the same "let a build failure confirm
the identifier" discipline task 12.5 established for this app's own
commands).

**Verified:** `cargo fmt --check`/`clippy`/`test` (62 tests, unaffected)
and `cargo build` clean (confirms the new capability permission is valid).
`tsc --noEmit`/`eslint`/`prettier --check` clean. Real Vite dev server in a
real browser: clicking Light changed the *entire* app (nav chrome and Chat,
not just Settings) to light immediately; switching back to System and
toggling the browser's own emulated color scheme (`prefers-color-scheme`)
live-updated the theme in both directions without a reload — the exact
"tracks the OS preference, doesn't freeze at first render" bar the
checklist asks for. Zero console errors. `scripts/ci/launch-smoke.js`
re-run against the freshly built binary. **Honest, narrower gap than
usual:** the live theme-switching behavior itself *was* verified for real
in a real browser (this is a pure frontend/CSS behavior, not an IPC round
trip) — only the native-window rendering and the real `getVersion()` IPC
call (falls back to a blank version line in this browser-only preview,
correctly, rather than showing a lie) remain unverified against the actual
Tauri app, the same limitation every desktop UI task since 12.5 has
carried.

---

#### ✅ 13.5 — Chat screen consolidation

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

**Decided: navigation state stays lifted in `AppShell`, passed down as a
narrow `onNavigate: (destination: 'models' | 'connectors') => void`
prop** — not the full `Destination` union `AppShell` itself uses, so
`ChatScreen.tsx` can't accidentally navigate somewhere Settings-shaped;
`setDestination` satisfies that narrower type by ordinary function-type
contravariance, no adapter needed. Connector consent became fully
read-only from Chat's side: `connectorGranted` is now only ever *read*
from `connectorStatus()` on mount and passed straight through as
`connector_mode`, never written locally — the grant/revoke lever lives
only in `ConnectorsScreen.tsx` now, so there is exactly one place that
mutates consent, not two that could quietly disagree (the previous
`ChatScreen.tsx` toggle and a future `ConnectorsScreen.tsx` toggle would
have been exactly that). The model-status state machine shrank from six
states (`loading-list`/`no-model`/`preparing`/`ready`/`busy`/`error`) to
four (`loading`/`no-model`/`ready`/`busy`) — `preparing`/`error` existed
only for the install/load flow this screen no longer owns.

**Verified:** `tsc --noEmit`/`eslint`/`prettier --check` clean; `cargo
build` and `scripts/ci/launch-smoke.js` re-run to confirm the (untouched)
Rust side is unaffected. Real Vite dev server in a real browser: clicking
the "Choose a model" indicator on Chat navigated to Models; clicking the
"Connectors" indicator navigated to Connectors; both round-tripped back to
Chat correctly via the sidebar. Zero console errors. **Honest gap, same as
every desktop UI task since 12.5:** this environment cannot drive the
actual native Tauri window, so the full real round trip the checklist asks
for — install a model, grant Search, send a message, see it answered and
tagged — was not walked through by hand end to end. Every piece of it was
independently proven for real elsewhere: the underlying `generate_chat`/
routing/orchestration path by task 12.7a's own on-device test, and
install/activate/remove and grant/revoke by tasks 13.2/13.3's own
Rust-level verification (unchanged, already-tested `connectors::
permissions` and `models::ModelManager` code) — what's unverified here is
specifically the UI-navigation glue connecting them, not the underlying
operations.

---

#### ✅ 13.6 — Search connector setup screen

**Goal:** Close the second-ranked gap a mobile/desktop feature audit found:
`ConnectorsScreen` (13.3) only grants/revokes an existing connector — it has
no way to actually configure one. Desktop's "Search" connector was a
**static, unconfigurable fixture** embedded via `include_str!`
(`https://searx.example.org`, a non-dialable placeholder domain), confirmed
by reading the code to not even match either of mobile's own two real
manifest-building functions (`buildSearxngManifest`/`TAVILY_MANIFEST`) — a
stale, hybrid shape nothing else in the codebase produced. This task
replaces it with the real thing: user-entered config, mirroring mobile's
`SearchSetupScreen.tsx` field-for-field, copy-for-copy.

**Deliverables:**

- A new `connectors::search` Rust module (`manifest.rs` + `config.rs`,
  mirroring mobile's own `connectors/search/{manifest.ts,config.ts}`
  directory shape) building real SearXNG/Tavily manifests and persisting
  the chosen provider/URL/key-presence as `search-config.json`, colocated
  with `grants.json`.
- `search_connector_manifest()`/`known_connector_manifests()` become
  config-driven instead of fixture-driven — Search now only appears once
  configured, exactly mirroring mobile's own `installedConnectors()`
  returning `[]` when unconfigured.
- A new `set_search_connector_config` command doing the real save flow:
  build a candidate manifest, run it through the existing
  `validate_manifest`, an extra Tavily-key-non-empty check, a vault write
  for the Tavily credential, then `write_search_config` + `permissions::
  grant`.
- `SearchSetupScreen.tsx` (new), a direct port of mobile's screen; `Connectors
  Screen.tsx` gains an empty-state "Not set up" row and a "Change provider or
  key" reconfigure row, both navigating to it via a new `onNavigate` prop
  on `AppShell`'s non-sidebar `'connectors-setup'` destination.

**Real behavior change, stated plainly:** Search stops being an
always-present (but never actually dialable) connector and instead only
appears once a user configures it — correct, not a regression.

**Dependencies:** Task 13.3 (`ConnectorsScreen`, extended here rather than
replaced).

**Review checklist:**

- Submitting an invalid SearXNG URL (empty, non-https) or empty Tavily key
  is rejected with a real, specific error message, not a generic failure.
- A valid SearXNG URL saves config and grants without touching the vault; a
  valid Tavily key writes the vault credential (`apiKey` = `Bearer
  <key>`) and grants. `ConnectorsScreen` renders the correct empty vs.
  configured state in both directions.

**Decided: reuse `validate_manifest`, no new validation logic.** The
Rust-side save flow doesn't invent its own URL/format checks — it builds a
candidate `ConnectorManifestTier1` from the request and runs the same
`connectors::manifest::validate::validate_manifest` every other manifest
already goes through, plus one extra Tavily-specific check
(`"Enter your Tavily API key."`) mobile's own screen also has no equivalent
validator for. This is the first Tauri command to call
`secure_storage::open_vault(...).write(...)` directly from a UI-triggered
path — `secure_storage/mod.rs`'s doc comment claiming vault is "never
called from UI code either" was stale and corrected in this task's commit.

**A real flaky-test bug this task's own review checklist caught:** two new
Rust tests (SearXNG and Tavily save paths) both exercise the literal
production `CONNECTOR_ID` (both providers share one connector id, by
design), against the process-global mock keyring `use_test_keyring_backend()`
installs. Under `cargo test`'s default parallelism, the Tavily test's vault
write occasionally leaked into the SearXNG test's "no vault write happened"
assertion. Fixed with a `static VAULT_TEST_LOCK: Mutex<()>` serializing just
those two tests against each other, plus an explicit vault-clear at the
start of the SearXNG test as a clean-baseline safeguard — verified stable
across repeated `cargo test` runs afterward.

**Verified:** `cargo fmt --check`/`clippy --all-targets -- -D warnings`/
`test --lib` (70/70 passing, including 5 new tests covering both providers'
reject/accept paths) clean. `pnpm typecheck`/`lint`/`prettier --check`
clean. Real Vite dev server in a real browser: the provider toggle switches
between the SearXNG URL field and the Tavily password field correctly,
with the exact mobile-mirrored copy and hints. Real debug binary build
(`pnpm tauri build --debug --no-bundle`) + `scripts/ci/launch-smoke.js`
against the freshly built binary. **Honest gap, same class as every desktop
UI task since 12.5, but narrower than most:** the actual native-window
click-through (open Connectors, tap "Not set up", fill in a real SearXNG
URL, save, confirm it now appears granted) can't be driven in this sandbox
(no Accessibility/screen access) — but unlike a typical frontend-only task,
this one's real logic (validation, vault write, config persistence, grant)
is covered by real Rust tests against the actual production code path, not
just typechecking, so the untested surface is narrowly the UI-navigation
glue, not the underlying save/validate/grant behavior.

---

---

#### ✅ 13.7 — Cancel an in-flight model download

**Goal:** Close the stated gap task 13.2 shipped with: mobile's
`ModelsScreen.tsx` lets a user tap a downloading/verifying row to cancel
it (the only stop control), but desktop's `install_model` command
hardcoded `DownloadOptions.cancel: None`, so a downloading row was
read-only.

**Deliverables:**

- `AppState` gains `downloads: Mutex<HashMap<String, CancellationToken>>`
  — one cancel switch per in-flight download, keyed by model id, mirroring
  mobile's own `Map<string, AbortController>`.
- `install_model` constructs a real `CancellationToken`, stashes it keyed
  by id before downloading, passes it into `DownloadOptions.cancel`
  (previously hardcoded `None`), and removes the entry once the download
  settles either way.
- New command `cancel_install(id)` trips the stashed token if present,
  silently harmless otherwise — mirrors mobile's `controllers.get(id)
  ?.abort()`.
- `ModelsScreen.tsx`'s downloading/verifying rows are now clickable
  (`CANCEL` accessory, `tap to cancel` subtitle suffix on the downloading
  line), and a cancelled install drops its row entirely rather than
  showing a failure — mirroring mobile's exact copy and its "a cancel is
  not a failure to report back" handling.

**Dependencies:** Task 13.2 (the screen this closes the gap in).

**Review checklist:**

- Cancelling an in-flight download actually stops it and deletes the
  partial file, rather than merely hiding the row while the transfer
  continues in the background.

**Decided: nothing needed to change in `download.rs` itself.** Reading
the code first showed the cancellation mechanism was already fully built
and unused: `DownloadOptions.cancel: Option<CancellationToken>` was
already checked every loop iteration, and `download_model` already
deleted the partial `.part` file on a `Cancelled` error, the same cleanup
path a checksum failure takes. The entire gap was that no caller ever
constructed a token — closing it was pure plumbing (`lib.rs` + a new
command + the frontend), no changes to the download logic itself.

**A real gap this task's own review caught, not just this task's scope:**
`download.rs` had zero tests of any kind before this task, despite being
one of the more failure-prone modules in the app (network, disk, resume,
stall, and now cancellation all interact there). Added two real,
unmocked tests using the same hand-rolled local-`TcpListener`-server
pattern `tests/connector_dispatch.rs` and `tests/tool_calling_smoke.rs`
already established (no mocking library in this repo): a pre-cancelled
token stops the download before any bytes land, and a token cancelled
mid-stream (triggered from the real `on_progress` callback, against a
server that pauses between chunks) stops it and confirms the partial file
is actually deleted from disk — not just trusting `download_model`'s
cleanup branch by reading it.

**Verified:** `cargo fmt --check`/`clippy --all-targets -- -D warnings`
clean; `cargo test --lib` (72/72 passing, including the 2 new
cancellation tests). `tsc --noEmit`/`eslint`/`prettier --check` clean.
Real Vite dev server in a real browser: a scratch-only seeded row (this
sandbox cannot drive a real multi-GB download) confirmed the `CANCEL`
accessory, the `tap to cancel` subtitle, and that clicking the row fires
`cancelInstall` with no console errors — the scratch state was reverted
before committing, confirmed via `git diff` showing only the real code
changes remain. Real debug binary build
(`pnpm tauri build --debug --no-bundle`) + `scripts/ci/launch-smoke.js`.
**Honest gap, narrower than most:** a real native-window click-through
(start installing an actual multi-GB model, cancel it mid-transfer,
confirm the `.part` file is gone from disk) can't be driven in this
sandbox — but unlike a typical frontend-only task, the actual
cancellation mechanics are proven by real, unmocked local-server tests
against the real `download.rs` code path, not just typechecking; the only
unverified surface is the thin UI-click-to-IPC-call glue, structurally
identical to every other button-to-command wire-up already proven
elsewhere in this app.

---

#### ✅ 13.8 — Frontend test coverage (Vitest + Testing Library)

**Goal:** Close the highest-ranked gap a fresh feature audit found: desktop
had zero automated frontend test coverage — no `test` script, no
`*.test.*` files anywhere under `apps/desktop/src` — while mobile has 20
test files and a `pnpm test --ci` CI gate. Every desktop screen's
interaction logic (install/activate/remove/cancel dispatch, connector
grant/revoke, provider validation, theme switching, mode-derived
`connector_mode`) was verified only by hand in the Browser pane during its
own task, with nothing left behind to catch a regression.

**Deliverables:**

- Vitest (not Jest, unlike mobile) — desktop already runs on Vite, so
  reusing its own config for tests is the "don't add a dependency this
  app doesn't need" call task 12.6 made about a styling library, not a
  Jest-vs-Vitest preference. `apps/desktop/vite.config.ts` gained a
  `test` block (`environment: 'jsdom'`, `globals: false` — explicit
  `import { describe, it, expect } from 'vitest'` everywhere, matching
  this codebase's own no-implicit-globals style).
- `src/test/setup.ts`: Testing Library's per-test `cleanup()` wired by
  hand (its automatic Jest-global hook doesn't fire under
  `globals: false`), plus two jsdom polyfills found only by running the
  tests, not by reading docs first — `window.matchMedia` (missing
  entirely; `ThemeProvider` calls it unconditionally on mount) and
  `Element.prototype.scrollTo` (missing entirely; `ChatScreen.tsx` calls
  it to keep the transcript pinned).
- 37 tests across 7 files: `ModelsScreen`, `ConnectorsScreen`,
  `SearchSetupScreen`, `SettingsScreen`, `ChatScreen`, `ModeBar`,
  `modes.ts` — covering each screen's real dispatch logic (which Tauri
  command fires for which click, not just "it renders"), not an
  exhaustive port of mobile's own 20 files. Every screen already mocks
  `../lib/tauri`'s named exports via `vi.importActual` + selective
  `vi.fn()` overrides, keeping `TauriCommandError`'s real class (needed
  for `ModelsScreen`'s `cause instanceof TauriCommandError` check from
  task 13.7 to work under test).
- `apps/desktop/package.json`'s `test` script is `sh -c 'vitest run'`,
  not a bare `vitest run` — a deliberate wrapper, not stray shell syntax:
  root `ci.yml`'s existing `pnpm test --ci` step (mobile's own Jest gate)
  forwards `--ci` to *every* workspace package's `test` script via
  `pnpm -r --if-present`, confirmed by actually running it
  (`apps/mobile test$ jest --ci --filter desktop` when tested with an
  extra `--filter` flag, showing pnpm appends literally everything after
  `test` to each package). Vitest's CLI parser rejects unknown flags
  outright, so a bare `vitest run` would break the shared CI step the
  moment desktop got a `test` script at all. `sh -c 'vitest run'` runs
  the quoted command as its own shell invocation; anything appended after
  it becomes `sh -c`'s own positional parameters (`$0`, `$1`, ...), never
  reaching the quoted command line — `--ci` is silently absorbed rather
  than either breaking the build or requiring a change to mobile's own
  Jest invocation. No `.github/workflows/desktop.yml` change was needed:
  that workflow only builds/launches the native Tauri binary; the shared
  `ci.yml`'s `pnpm test --ci` step already fans out to every workspace
  package `--if-present`, so it started running desktop's suite the
  moment the script existed.

**Dependencies:** Tasks 13.2–13.7, 12.7, 12.8 (the screens under test).

**Review checklist:**

- `pnpm test` (desktop) and root `pnpm test --ci` (matching the real CI
  invocation exactly) both pass, testing the actual dispatch logic per
  screen, not just that components mount without throwing.

**Decided: coverage of real interaction paths, not parity with mobile's
file count.** Each test asserts on the actual mocked Tauri call and its
arguments (e.g. `ChatScreen`'s `connector_mode` derivation per mode —
`'off'`/`'auto'`/`'required'` — and `ModelsScreen`'s cancelled-vs-real-
failure branch from task 13.7), not just rendered text, since a screen
that renders correctly but calls the wrong command is the regression this
task exists to catch.

**Verified:** `pnpm test` (7 files, 37/37 passing) and root `pnpm test
--ci` (mobile 241/241 + desktop 37/37, the literal CI command) both
clean. `pnpm typecheck`/`eslint .`/`prettier --check` all clean for the
new test files and config. No Rust changed, so `cargo` verification was
skipped — nothing to re-run.

---

---

#### ✅ 13.9 — Static offline-boundary import-graph check

**Goal:** Close the third-ranked gap the same audit found: mobile has a
static CI check (`scripts/ci/check-offline-boundary.js`) walking the
import graph from `src/chat/` and failing if it transitively reaches
`src/models/`/`src/connectors/` — a check ESLint's own file-at-a-time
scope cannot do. Desktop had no equivalent at all.

**Deliverables:**

- `apps/desktop/scripts/ci/check-offline-boundary.js` — a direct port of
  mobile's script (same BFS-shortest-chain algorithm, same
  `ts.preProcessFile`-based import reading so `export … from`/type-only
  imports/`require()` are all seen correctly), adapted for two real
  differences: converted to ESM (`import`/`fileURLToPath`, not
  `require`) since `apps/desktop/package.json` sets `"type": "module"`
  (mobile's does not); and its error message points at the real desktop
  boundary — `src/chat/` reaches the network only through
  `src/lib/tauri.ts`'s `invoke()` calls into the Rust backend (task
  12.9's `net_guard.rs` guards those at runtime), not through any
  frontend HTTP client, so the fix instruction says "add a wrapper to
  `src/lib/tauri.ts`," not mobile's "invert through `ChatSessionContext`."
- New `check:offline` script in `apps/desktop/package.json`; root
  `package.json`'s own `check:offline` script changed from
  `pnpm --filter mobile check:offline` (mobile-only) to
  `pnpm -r --if-present check:offline`, matching the existing
  `lint`/`typecheck`/`test` fan-out pattern — picks up desktop
  automatically, and any future workspace package too.

**Dependencies:** None new — reuses the existing `typescript` compiler
dependency already present for `tsc --noEmit`.

**Review checklist:**

- The check passes on the real, unmodified `src/chat/` tree, and
  correctly fails with the right chain when a violation is planted.

**Decided: same algorithm, narrower scope than mobile's, stated
honestly.** Desktop's frontend has no direct network layer of its own —
every real network call happens in the already-guarded Rust backend
(task 12.9) — so this check's actual job is narrower than mobile's own
(which guards a JS runtime that really can call `fetch` directly): it
exists to stop `src/chat/` from bypassing `src/lib/tauri.ts` by importing
`src/models/`/`src/connectors/` directly, and to catch a browser HTTP
client package if one is ever added to `src/chat/`, not one that exists
today.

**Verified:** ran against the real, unmodified `src/chat/` tree —
`Offline boundary intact: 3 files under src/chat/...`. Planted a real
scratch violation (a throwaway `import { listModels } from
'../models/ModelsScreen'` appended to `modes.ts`) and confirmed the
script reported the exact chain and exited non-zero, then reverted it
before committing (confirmed via `git diff` showing no leftover change).
`pnpm typecheck`/`eslint .`/`prettier --check` clean for the new script.
Root `pnpm check:offline` confirmed to run both apps' checks in one
invocation, matching what `ci.yml`'s existing step will now exercise
with no workflow-file change needed (`ci.yml`'s "Check the offline
boundary" step already just calls `pnpm check:offline`).

---

---

#### ✅ 13.10 — No-hardcoded-color ESLint rule

**Goal:** Close the fourth-ranked (lowest-severity) gap the same audit
found: mobile enforces "no screen hardcodes a color outside the theme
module" as an ESLint rule, verified by a planted-violation test; desktop
had the same convention as an unwritten habit only, nothing stopping a
screen from hardcoding a hex/`rgb()`/`hsl()` literal outside
`packages/design-tokens`.

**Deliverables:**

- `apps/desktop/eslint.config.js` gained a `no-restricted-syntax` rule
  banning `#hex`/`rgb()`/`rgba()`/`hsl()`/`hsla()` literals under
  `src/**/*.ts(x)` (excluding test files) — the same regex mobile's own
  rule uses, byte-for-byte.

**Dependencies:** None new — the base ESLint config already exists.

**Review checklist:**

- The rule passes on the real, unmodified tree, and fires with the right
  message on a planted color literal.

**Decided: no exemption directory needed, unlike mobile's.** Mobile's
rule exempts `src/design-system/` because that's where color values are
legitimately defined. Desktop's equivalent (`packages/design-tokens`)
lives outside `apps/desktop/`'s own directory tree entirely — `eslint .`
run from `apps/desktop/` never reaches it — so no exemption glob was
needed; the rule's own message points there anyway, for a developer who
hits the error and needs to know where a genuinely new color belongs.

**Verified:** ran against the real, unmodified `apps/desktop/src/` tree
— clean, confirming no existing hardcoded color was already present to
grandfather in. Planted a real scratch violation
(`export const scratchColor = '#ff0000';` appended to `modes.ts`) and
confirmed ESLint reported the exact rule and message, then reverted it
before committing (`git diff` confirmed clean). `pnpm typecheck`/`prettier
--check` also clean.

---

This closes epic 13 (Desktop App Shell) — all of tasks 13.1–13.10 are done.

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
