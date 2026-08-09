---
epic: 11
title: Device Connector
status: "✅ Complete — 11.1 (brightness) and 11.2 (torch) both done, both real-device-verified"
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

#### ✅ 11.2 — Torch

**Goal:** Let the model turn the flashlight on/off.

**Why this shipped separately from 11.1:** researching the actual
`expo-camera` API before writing code found it has **no imperative
"toggle the flashlight" function at all** — `enableTorch` only exists as a
prop on a live, mounted `<CameraView>` (confirmed by reading the package's
own type declarations). Every Tier 3 handler shipped before this
(`device.info`, Calendar's four operations, 11.1's brightness) had been a
plain function with zero UI-tree dependency; torch is the first one
needing an actual camera session mounted somewhere in the app. On top of
that, neither the iOS Simulator nor any environment used for the initial
implementation pass had real flash hardware. Shipped as its own fast-follow
once a physical iPhone became available in this environment, the same
treatment Calendar's Windows/Linux gap (task 10.3) got for being deferred.

**Deliverables:**

- Requires the standard camera permission on both platforms even though
  nothing is captured or stored — a real OS permission step, same shape as
  Calendar's `ensureCalendarAccess()` (check status, prompt once if
  undetermined, gate the app's own `grant()` on a real `true` result):
  `permissions/cameraAccess.ts`'s `ensureCameraAccess()`.
- `device.set_torch` tool, `on: boolean` (required — unlike brightness
  there is no meaningful "read" state for torch).

**Dependencies:** Task 2.6 (Tier 3 scaffolding); 11.1 (the manifest/handler
shape to mirror, though torch's handler can't be a plain function the way
every other one has been — see above).

**Review checklist:**

- Asking the model to turn on/off the flashlight visibly does so on a
  **physical device** — the iOS Simulator has no flash hardware, so this
  cannot be checked there.
- Revoking this connector's permission does not affect any other
  connector's permission or vice versa.

**Decided (during implementation):**

- **Where the live `<CameraView>` lives** — the fork task 11.2 originally
  left open. Resolved as: mounted once, always, at the app root
  (`App.tsx`, alongside `<StatusBar>`), but only rendering an actual
  `<CameraView>` once camera permission is known granted — checked once on
  `TorchHost.tsx`'s own mount (covers a connector granted in an earlier
  app session) and updated live via a small new bridge module,
  `connectors/device/torchBridge.ts`, whose `notifyCameraPermissionGranted()`
  the `setTorch` handler calls right after `ensureCameraAccess()` resolves
  `granted: true`. This sidesteps needing a general "connector grant
  changed" event system — nothing else in the app has one, and building
  one just for this would have been a bigger, separate change — while
  still keeping the camera session at zero cost for anyone who never
  grants this connector (no permission, no session, regardless of mount).
- `torchBridge.ts` also holds the `TorchController`/`setTorchController`
  pair (`setTorch(on)` → local component state → `enableTorch` prop) —
  the one genuinely new pattern in this codebase's connector runtime,
  since every other `NativeHandler` is a pure function with no
  relationship to anything mounted in the component tree.
- No torch readback API exists (unlike brightness's `getBrightnessAsync`),
  so `setTorch`'s reported text is optimistic — it reflects what was
  requested, not a re-read confirmation.

**Two real bugs found and fixed during physical-device verification** —
neither was visible in any Simulator run or unit test; both only surfaced
once this connector was actually installed and launched on real hardware:

1. **The app crashed on launch (`SIGABRT`) on the physical iPhone, before
   reaching the home screen.** Root cause: `apps/mobile/ios/` — gitignored,
   generated output — had never been regenerated via `npx expo prebuild`
   since the `expo-calendar` and `expo-camera` config-plugin entries were
   added to `app.json`; only `pod install` had been run, which links
   native code but does not apply config plugins. `Info.plist` was
   therefore missing `NSCameraUsageDescription` entirely (and, it turned
   out, `NSCalendarsUsageDescription`/`NSCalendarsFullAccessUsageDescription`
   too — Calendar's own physical-device verification had only ever run on
   the Simulator, which tolerates this differently). Mounting `<CameraView>`
   without the required Info.plist key hard-crashes on real hardware.
   Fixed with `npx expo prebuild --clean --platform ios` (regenerates
   `ios/` from `app.json`) followed by the already-established
   `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install` fix for this
   environment's CocoaPods Unicode bug.
2. **The first real grant reported success but the flashlight never lit.**
   Root cause: with `TorchHost` originally mounting `<CameraView>`
   unconditionally at app launch — before any camera permission existed —
   the native capture session did not retroactively start once permission
   was granted later in the session; nothing told the already-mounted view
   to reconfigure. Fixed by the permission-gated mount + notify-on-grant
   bridge described above.

**Observed, explicitly out of scope:** the model sometimes asked for the
`on` argument more than once in chat before actually calling
`device_set_torch`, even though the tool call ultimately succeeded and the
flashlight worked correctly once invoked. This is model tool-calling
behavior, not a torch defect — confirmed with the user, who has a separate
plan for that and asked it not be addressed here.

**Verified:**

- `pnpm --filter mobile typecheck`/`lint`/`test` (338 tests, up from 329 —
  `torchBridge.test.ts`, `permissions/cameraAccess.test.ts`,
  `device/TorchHost.test.tsx`, extended `device/handlers.test.ts` and
  `device/manifest.test.ts`, extended `ConnectorsScreen.test.tsx`).
- Real `pnpm install` + `pod install` linked the new `ExpoCamera` native
  module (98 dependencies, up from 96).
- Real physical iPhone (a real device connected to this environment, not
  the Simulator) build via `xcodebuild ... -destination
  'id=<udid>' -allowProvisioningUpdates build`, installed and launched via
  `xcrun devicectl device install app` / `process launch` — the same
  sequence 11.1 used, extended here because 11.2 specifically needs real
  flash hardware to mean anything.
- After fixing both bugs above: a real OS camera-permission dialog
  appeared on tapping the "Device — Flashlight" row, the row flipped to
  `ALLOWED`, and — confirmed directly by the user on the physical device,
  not simulated or assumed — asking the assistant in chat to turn the
  flashlight on and back off actually toggled the hardware flash both
  times.
- **Honest gap:** a live revoke round-trip (tapping the now-`ALLOWED` row
  back off) was not separately re-confirmed on this physical device after
  the fixes — it uses the same `revoke()`/`refresh()` path exercised for
  every other connector and is covered by a passing unit test
  (`ConnectorsScreen.test.tsx`'s torch `describe` block), the same
  low-risk gap 11.1 documented for the same reason.

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
