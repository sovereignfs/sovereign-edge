---
epic: 10
title: Calendar Connector
status: "⏳ In Progress — 10.1 (mobile) done; 10.2 (desktop, macOS only) done; Windows/Linux desktop unsupported"
scope: shared
---

# Epic: Calendar Connector

> A first-party Tier 3 connector letting the model create, update, delete,
> and query the user's own on-device calendar.

## Overview

The first connector that reaches an on-device OS capability rather than the
network — a **Tier 3** connector per the Connector Framework's own original
three-tier design (research 0001), not Tier 1 like Search and Sovereign
Tasks. Blocked on epic [2](connector-framework.md)'s task 2.6 (Tier 3
scaffolding), which this epic is the first real consumer of on both mobile
and desktop.

Full findings, options, and the reasoning behind this epic's scope live in
[research 0005](../../research/0005-calendar-connector.md) (mobile) and
[research 0011](../../research/0011-desktop-calendar-connector.md) (desktop
— why macOS only) — this file states the decided scope as tasks, those docs
keep the *why*. Originally scoped mobile-only; the user asked for desktop
too, which is what task 10.2 and research 0011 add.

## Tasks

#### ✅ 10.1 — Calendar connector (mobile)

**Goal:** Let the model create, update, delete, and query events on the
user's own device calendar, via `expo-calendar`.

**Deliverables:**

- A Tier 3 connector manifest (per task 2.6's schema) declaring four tools:
  `calendar.create_event`, `calendar.update_event`, `calendar.delete_event`,
  `calendar.query_events`.
- Reminders are modeled as an alert offset on a created event, not a
  separate API surface — the one interpretation of "reminders" that behaves
  identically on iOS and Android (research 0005's findings: iOS EventKit has
  a genuinely separate Reminders store; Android has no equivalent at all).
- MVP scope is deliberately narrow: single, non-recurring, timezone-naive
  events. Recurrence, timezone handling, and all-day events are explicitly
  out of scope for this task.
- New events are written to a fixed default/primary calendar for MVP — see
  Open Questions below for the eventual calendar-picker flow.

**Dependencies:** Task 2.6 (Tier 3 scaffolding).

**Review checklist:**

- Creating an event via chat results in a real event appearing in the
  device's own Calendar app, on both platforms.
- Querying "what's on my calendar" returns events actually present on the
  device, not a stale or cached view.
- Deleting or updating an event via chat is reflected in the Calendar app
  immediately.
- Revoking this connector's permission does not affect any other
  connector's permission (Search, Sovereign Tasks) or vice versa — the same
  bar task 2.2 already set for Tier 1 connectors, now proven for Tier 3.

**Open questions from research 0005, resolved during implementation:**

- Which calendar new events are written to — resolved as the primary/
  default calendar; no calendar-picker setup step was added, kept as a
  plausible fast-follow rather than in-scope here.
- `expo-calendar@57.0.1` is compatible with the installed Expo SDK 57/RN
  0.86 toolchain — confirmed by a real `pnpm install` and reading its
  actual `package.json`/type declarations, not assumed. One real surprise:
  SDK 57's `expo-calendar` ships a new, sync-first default API (under
  `'expo-calendar'` itself) that has **no event CRUD at all** — the
  functions this connector needs (`createEventAsync`, `getEventsAsync`,
  `requestCalendarPermissionsAsync`, etc.) only exist under the
  `'expo-calendar/legacy'` subpath, confirmed by reading the package's own
  `exports` map, not guessed from an older SDK's shape.
- iOS's full-access vs. write-only permission tiers: resolved by *not*
  setting `writeOnlyAccess: true` in the `expo-calendar` config plugin
  (`app.json`) — its default path sets
  `NSCalendarsFullAccessUsageDescription`, giving `query_events` the
  access tier it needs, confirmed by reading the plugin's own source
  rather than assumed from the option name.

**Decided (not in research 0005):**

- **Four separate manifests/connector ids, not one manifest with four
  tools.** The Tier 3 schema gives every manifest exactly one `tool` and
  one `handler.capability` — there is no shape for "one connector, several
  tools." This is a real fit with the app's "no blanket toggle,
  per-connector consent" philosophy (a user can allow `query_events`
  without allowing `delete_event`), not a workaround.
- **One real OS permission prompt for all four, not four.** All four
  manifests share one underlying OS permission domain — `permissions/
  calendarAccess.ts`'s `ensureCalendarAccess()` checks current status
  first and only prompts if undetermined, called from
  `ConnectorsScreen.tsx`'s grant handler *before* the app's own `grant()`,
  never after (an OS denial must never let the app record "granted" for a
  connector EventKit/Calendar will actually refuse to run).

**Verified:**

- `pnpm --filter mobile typecheck`/`lint`/`test` (293 tests, up from 268 —
  `calendar/manifest.test.ts`, `calendar/handlers.test.ts` (mocking
  `expo-calendar/legacy`), `permissions/calendarAccess.test.ts`, and new
  `ConnectorsScreen.test.tsx` cases for the permission-then-grant flow and
  OS-denial message).
- Real iOS Simulator build and launch: a real `pod install` (linked the
  new `ExpoCalendar (57.0.1)` native module for the first time) and a real
  `xcodebuild` against the actual Xcode project, then a real tap through
  Settings → Connectors on a booted simulator, confirming the four
  Calendar rows are genuinely rendered from the real manifests (not a
  mock) and that tapping one calls the real `ensureCalendarAccess()` →
  real `expo-calendar/legacy` `requestCalendarPermissionsAsync()` → a real
  OS response, handled correctly (no `grant()` call, the exact denial
  message shown, state remains `not-asked` rather than falsely
  `granted`).

**Honest gap:**

- **A real interactive "Allow" tap could not be captured.** This
  automated build+launch context (via this environment's iOS Simulator
  build tool) never surfaced a visible system permission dialog to tap —
  the OS resolved straight to denied. `xcrun simctl privacy grant
  calendar <bundle-id>` was also tried directly against the booted
  simulator and did not flip what `getCalendarPermissionsAsync()` reads
  back at runtime. The denial *path* itself is proven correct end to end
  (real API call, real response, correctly handled) — only the *granted*
  path's real device behavior remains unconfirmed, the same class of gap
  as task 10.2's desktop EventKit dialog. A real device or an
  interactive (non-headless) Simulator.app session, with a human's one-time
  tap, would close it.

## Related Docs

- [research 0001](../../research/0001-concept-and-connector-architecture.md)
- [research 0005](../../research/0005-calendar-connector.md)
- [research 0011](../../research/0011-desktop-calendar-connector.md)
  (desktop, task 10.2)
- [Connector Framework](connector-framework.md) (task 2.6, the Tier 3
  scaffolding this epic depends on)

## Cross-references

- Shares its Tier 3 dependency (task 2.6) with the
  [Device connector](device-connector.md) (epic 11).
- Mirrors the Sovereign Tasks connector's (epic 4) "direct integration, not
  delegation" pattern — this connector writes to the calendar itself, it
  does not hand off to another app's UI.

---

#### ✅ 10.2 — Desktop calendar connector (macOS only)

**Goal:** The same four tools, on desktop, via real Apple EventKit
bindings — macOS is the only desktop OS this pass supports; see
[research 0011](../../research/0011-desktop-calendar-connector.md) for why
Windows (package-identity requirement this app's unpackaged distribution
doesn't have) and Linux (no single calendar API) are out of scope for now.

**Deliverables:**

- `apps/desktop/src-tauri/src/connectors/calendar/{mod,manifest,handlers,access}.rs`,
  `#[cfg(target_os = "macos")]`-gated: four manifests mirroring mobile's
  (same ids/tools, `platforms: ["desktop"]`), synchronous CRUD/query
  handlers via `objc2-event-kit`'s `EKEventStore`, and the one
  completion-handler → async bridge this connector needs
  (`requestFullAccessToEventsWithCompletion`, exposed as its own
  `request_calendar_access` Tauri command).
- `known_connector_manifests()` in `lib.rs` includes the four manifests via
  `connectors::calendar::calendar_manifests()`, which itself returns an
  empty `Vec` off macOS — no `cfg!` needed at the call site, and Windows/
  Linux builds never advertise a connector they can't run.
- Same permission-ordering rule as mobile: `ConnectorsScreen.tsx` calls
  `request_calendar_access` and only calls `set_connector_granted(id,
  true)` on a real `true` result.

**Dependencies:** Task 2.6 (Tier 3 scaffolding, desktop side); research
0011.

**Review checklist:**

- Same four review points as task 10.1, on macOS: create/update/delete/
  query all reflect in the real macOS Calendar app; revoking one calendar
  connector doesn't touch another connector's grant.
- A Windows or Linux build's Connectors screen never shows a Calendar row
  at all (not a broken one).

**Decided:**

- **Same capability-doubles-as-permission-scope shape mobile ended up
  needing**, for the same reason: the validator's cross-field rule
  (`validate.rs`'s `tier3CrossFieldIssues`) requires `handler.capability`
  to be a *member* of `permissions.device.capabilities` — a coarser shared
  scope across the three write manifests isn't expressible without
  duplicating both strings per manifest, which would just make the
  per-connector scope text shown to the user redundant.
- **A fresh `EKEventStore` per handler call, not a held singleton.**
  Apple's own docs call a long-lived instance a *performance*
  recommendation, not a correctness requirement, and a `Retained<T>`
  Objective-C object isn't safely shareable across this app's
  multi-threaded Tauri command dispatch without its own synchronization —
  a fresh instance per call sidesteps that entirely.
- **No date/time crate dependency** for parsing the `YYYY-MM-DDTHH:MM:SSZ`
  strings the manifests declare — `parse_iso8601_utc`/`days_from_civil` in
  `handlers.rs` reuse the same Howard Hinnant civil-date algorithm
  `permissions/grants.rs`'s own `iso_now`/`civil_from_days` already
  established as this app's precedent for one-format date handling
  without a new dependency.

**Honest gap:**

- **The real macOS system Calendar-access dialog cannot be clicked by any
  tool available in this environment** — no macOS screen-automation tool
  exists (unlike the iOS Simulator, which does support tapping through
  system dialogs). `already_authorized()`/`request_access()` are proven
  correct against the real, side-effect-free `authorizationStatusForEntityType`
  query and a real `cargo build`/launch, but the actual "user clicks
  Allow" round trip needs a human's one-time manual click during a
  follow-up check — the same class of gap `vault_smoke.rs`'s real-keychain
  integration test already carries for this codebase.

**Verified:**

- `cargo fmt`/`clippy`/`test` (150 tests, up from 137 — 13 new calendar
  tests: manifest validation against the real validator, ISO-8601 parse/
  format round-trip against a real computed epoch timestamp, required-
  field refusal for all four handlers, and `native_handler_for` capability
  resolution).
- `pnpm --filter desktop typecheck`/`lint`/`test` (53 tests, up from 49).
- Real debug binary build (`pnpm tauri build --debug --no-bundle`,
  including a real `objc2-event-kit`/`block2` link) and launch-smoke
  check: process starts, stays running, no panic.
