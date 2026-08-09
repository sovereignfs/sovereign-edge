---
epic: 11
title: Device Connector
status: "⏳ In Progress — 11.1 (brightness) done; 11.2 (torch) planned as a fast-follow"
scope: mobile
---

# Epic: Device Connector

> A first-party Tier 3 connector for simple, low-sensitivity on-device
> hardware toggles — flashlight and screen brightness.

## Overview

Originally proposed as flashlight control plus alarm management. Research
0009 checked alarm creation/deletion against each platform's actual public
API surface and found neither achievable as a silent, programmatic action —
iOS exposes no alarm API to third-party apps at all, and Android's
`AlarmClock` intents only hand off to whichever clock app is installed, with
no way to enumerate or delete existing alarms. Alarms are dropped from scope
entirely; see [research 0009](../../research/0009-device-connector.md) for the
full findings.

Like [Calendar](calendar-connector.md), this is a **Tier 3** connector —
on-device native calls, not network requests — and depends on epic
[2](connector-framework.md)'s task 2.6 (Tier 3 scaffolding).

## Tasks

#### ✅ 11.1 — Brightness

**Goal:** Let the model read or set this app's own window brightness.

**Deliverables:**

- A Tier 3 connector manifest (per task 2.6's schema) declaring one tool,
  `device_set_brightness` — `value` is optional, so a call with no `value`
  is a read (reports the current brightness) and a call with `value` is a
  set-then-report, without needing a second manifest.
- Via `expo-brightness`'s app-window-scoped functions
  (`getBrightnessAsync`/`setBrightnessAsync`), not the system-wide
  variants. System-wide writes on Android require `WRITE_SETTINGS`, a
  special permission granted through a system settings screen rather than
  a normal runtime dialog; app-window brightness needs neither that nor
  any special permission on either platform — confirmed by reading
  `expo-brightness`'s own doc comments, not assumed: only the
  system-wide functions mention anything permission-related.

**Dependencies:** Task 2.6 (Tier 3 scaffolding).

**Review checklist:**

- Asking the model to change brightness visibly does so, scoped to the
  app's own window.
- Revoking this connector's permission does not affect any other
  connector's permission or vice versa.

**Decided (during implementation):**

- **One manifest, not two.** The original deliverable language ("read/set
  screen brightness") could have read as two tools; `value` being optional
  covers both without a second manifest — simpler, and avoids the same
  read/write-capability-split question Calendar had to resolve, since here
  there's only one OS-level concern (app-window brightness, no special
  permission at all) rather than two.
- **No OS permission step**, unlike Calendar's `ensureCalendarAccess()` —
  `ConnectorsScreen.tsx`'s default `grant()` path is used as-is for this
  row, since there's no OS dialog to gate before it.

**Verified:**

- `pnpm --filter mobile typecheck`/`lint`/`test` (308 tests, up from
  293 — `device/manifest.test.ts`, `device/handlers.test.ts` (mocking
  `expo-brightness`), and new `ConnectorsScreen.test.tsx` cases).
- Real iOS Simulator build (a real `pod install` linked the new
  `ExpoBrightness` native module) and launch, with a real tap through
  Settings → Connectors confirming the row renders from the real manifest
  and flips to `ALLOWED` (green, no OS permission dialog) on tap — matching
  the "no OS permission step" design decision above. A same-pass Calendar
  row independently stayed `NOT ASKED` with its denial banner, confirming
  no cross-connector state leakage.
- **Honest gap:** a live revoke round-trip (tapping the now-`ALLOWED` row
  back to `NOT ASKED`) was not separately captured on-device this pass —
  simulator tap coordinates became unreliable partway through this
  verification session (a recurring environment quirk, not a new one; see
  Calendar's own verification notes). Revoke uses the exact same
  `revoke()`/`refresh()` path already exercised for every other connector
  (Search, store connectors, Calendar) and is covered by a passing unit
  test (`ConnectorsScreen.test.tsx`'s "revokes a granted brightness
  connector on tap"), so this is a real but low-risk gap, not a silent
  skip.

---

#### 📋 11.2 — Torch (fast-follow)

**Goal:** Let the model turn the flashlight on/off.

**Why this is its own task, not folded into 11.1:** researching the actual
`expo-camera` API before writing code found it has **no imperative
"toggle the flashlight" function at all** — `enableTorch` only exists as a
prop on a live, mounted `<CameraView>` (confirmed by reading the package's
own type declarations). Every Tier 3 handler shipped so far (`device.info`,
Calendar's four operations, 11.1's brightness) has been a plain function
with zero UI-tree dependency; a torch handler would be the first one
needing an actual camera session mounted somewhere in the app. On top of
that, neither the iOS Simulator nor any environment available for this
work has real flash hardware, so even a correct implementation would ship
completely unverified. Confirmed with the user directly: ship 11.1 now,
scope this as a real, tracked fast-follow rather than a same-day bolt-on
of a harder, unverifiable problem — the same treatment Calendar's
Windows/Linux gap (task 10.3) got.

**Deliverables:**

- Requires the standard camera permission on both platforms even though
  nothing is captured or stored — a real OS permission step, same shape as
  Calendar's `ensureCalendarAccess()` (check status, prompt once if
  undetermined, gate the app's own `grant()` on a real `true` result).
- A concrete design for where the live `<CameraView>` lives: mounted
  always (accepting a persistent camera-hardware/session cost even for
  users who never grant this connector) vs. mounted only once granted (and
  then how a freshly-granted state reaches an already-mounted component,
  since there's no reactive grant-change notification in this app today —
  `ConnectorsScreen.tsx`'s own grant state is read imperatively on render,
  not subscribed to). **Not decided here** — a real fork for whoever picks
  this up, not a detail to default silently.
- `device.set_torch` tool, `on: boolean` (required).

**Dependencies:** Task 2.6 (Tier 3 scaffolding); 11.1 (the manifest/handler
shape to mirror, though torch's handler can't be a plain function the way
every other one has been — see above).

**Review checklist:**

- Asking the model to turn on/off the flashlight visibly does so on a
  **physical device** — the iOS Simulator has no flash hardware, so this
  cannot be checked there; whoever picks this up needs a real device.
- Revoking this connector's permission does not affect any other
  connector's permission or vice versa.

**Explicitly out of scope (both 11.1 and 11.2):** alarm creation, listing,
or deletion — see research 0009's findings; not a gap to close later, a
capability that doesn't meaningfully exist to build against on either
platform.

## Related Docs

- [research 0001](../../research/0001-concept-and-connector-architecture.md)
- [research 0009](../../research/0009-device-connector.md)
- [Connector Framework](connector-framework.md) (task 2.6, the Tier 3
  scaffolding this epic depends on)

## Cross-references

- Shares its Tier 3 dependency (task 2.6) with the
  [Calendar connector](calendar-connector.md) (epic 10).
