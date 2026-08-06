---
id: 9
title: "Device connector: what's actually left after alarms drop out"
status: decided
date: "August 2026"
author: "Claude Code (session with the developer)"
scope: mobile
summary: "Candidate connector — originally proposed as flashlight control plus alarm set/clear"
---

# Research 0009 — Device connector: what's actually left after alarms drop out

**Related:** [Connector Framework](../epics/mobile/connector-framework.md),
[research 0005](0005-calendar-connector.md) (same Tier 3 classification and
shared scaffolding prerequisite)

---

## Question

The original proposal paired flashlight control with "set alarms, clear all
the alarms." Is alarm management actually buildable on either platform, and
if not, what does "Device connector" become?

## Findings

- **Flashlight/torch is confirmed viable on both platforms.** iOS
  `AVCaptureDevice.torchMode`, Android `CameraManager.setTorchMode()` —
  exposed via `expo-camera`'s `CameraView` `enableTorch` prop. Requires the
  standard camera permission on both platforms even though nothing is
  captured — a normal, low-sensitivity ask, not a special/sensitive
  permission tier.
- **Alarms — checked against each platform's actual public API surface:**
  - iOS has no public API for third-party apps to create, list, or delete
    Clock alarms. Shortcuts/Siri App Intents integration exposes *this app's
    own* actions to Shortcuts, in the other direction — it does not grant
    control over the system Clock app.
  - Android's `AlarmClock` intents (`ACTION_SET_ALARM`, `ACTION_SET_TIMER`,
    `ACTION_SHOW_ALARMS`) let an app **request** that some clock app create
    an alarm, via an implicit intent the receiving app may or may not honor
    silently — and there is no public intent to **enumerate or delete**
    existing alarms. Any installed clock app can register as the handler, so
    even alarm creation isn't guaranteed to land in a specific app.
  - Net: alarm creation is possible only as a **hand-off to whatever clock
    app is installed** on Android — not a direct, silent action, and not
    guaranteed which app receives it — and isn't possible at all on iOS.
    "Clear all the alarms" is not achievable as a programmatic action on
    either platform via any public API found.
- With alarms out, "Device connector" as originally scoped is really just
  "flashlight." A single-capability connector is thin enough to question
  whether it deserves its own manifest entry at all, versus being folded into
  something with a bit more surface.
- **Brightness** (`expo-brightness`) is a similarly simple on-device toggle
  worth pairing with flashlight: read/set screen brightness on both
  platforms. One wrinkle — Android's *system-wide* brightness write needs the
  `WRITE_SETTINGS` permission, a special permission granted via a system
  settings screen rather than a normal runtime dialog, unlike app-window-only
  brightness which needs nothing special. Scoping to app-window brightness
  avoids that heavier permission path unless system-wide control is
  specifically the goal.
- **Resolved, per [0005](0005-calendar-connector.md)'s reading of the actual
  implementation:** this is a Tier 3 connector, same as Calendar. Tier 1's
  manifest schema hard-requires an HTTP `origin` and network permissions;
  there's no way to express "call `expo-camera`'s torch toggle" in that
  shape, and the runtime's `executeConnectorCall()` has only ever
  implemented `case 1`. Tier 3 ("first-party native OS integration") is
  named in research 0001 and reserved as an extension point in
  `executeConnectorCall()`'s own doc comment, but not yet built. The
  permission *state machine* in `grants.ts` is already generic; only the
  *scope* it tracks (`grantedOrigins`, Tier-1-specific) needs a generalized
  equivalent for a capability-based scope like "torch" or "brightness."

## Options considered

**A. Ship "Device connector" as flashlight-only, alarms dropped entirely.**

**B. Bundle flashlight + app-window brightness into one small "Device
Utilities" connector, alarms dropped.**

**C. Keep researching whether any alarm capability is salvageable —
e.g. accepting Android's hand-off-only, best-effort behavior, with no
promise of deletion.**

## Recommendation

Option B. Flashlight alone is a thin justification for a standalone
connector; pairing it with app-window brightness (same "simple on-device
toggle" shape, same low permission bar when scoped this way) gives it enough
surface to be a coherent connector rather than a single-purpose one. Alarms
dropped — option C stays available if a specific product reason to want
partial, best-effort alarm creation shows up later, but nothing found here
argues for taking on that asymmetry now.

## Decisions

- **This is a Tier 3 connector**, same classification as Calendar
  ([0005](0005-calendar-connector.md)) and Health/step-count
  ([0008](0008-health-step-count.md)). It shares the same unbuilt
  prerequisite (manifest schema variant, generalized grant scope, `case 3`
  runtime dispatch) — not a separate piece of work per connector.
- Scope: flashlight (`device.set_torch`) + app-window brightness
  (`device.set_brightness`), not system-wide brightness.
- Alarm management (create/list/clear) is dropped from scope — not a
  platform-parity gap to close later, but a capability that doesn't
  meaningfully exist to build against.

## Open questions

- Is app-window-only brightness sufficient, or does the actual want extend
  to system-wide brightness (which pulls in Android's `WRITE_SETTINGS`
  special-permission flow)?
- Does a two-capability "Device Utilities" connector want more capabilities
  before shipping, or is flashlight + brightness enough for a first version?

## Next steps

**Done:** this connector has its own epic:
[device-connector.md](../epics/mobile/device-connector.md) (task 11.1), slotted
into [ROADMAP.md](../../ROADMAP.md) at 0.2.3 — right after Calendar.

**Actual next step for whoever picks this up:** same blocker as Calendar —
task [2.6](../epics/mobile/connector-framework.md#-26--tier-3-connector-scaffolding)
(Tier 3 scaffolding) has to land first. Once it does, task 11.1 is smaller
in native surface than Calendar and can start independently of it — the two
don't depend on each other, only on 2.6.
