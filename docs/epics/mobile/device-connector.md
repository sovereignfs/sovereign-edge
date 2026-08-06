---
epic: 11
title: Device Connector
status: "📋 Planned"
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

#### 📋 11.1 — Device Utilities connector

**Goal:** Let the model turn the flashlight on/off and read/set screen
brightness, on request.

**Deliverables:**

- A Tier 3 connector manifest (per task 2.6's schema) declaring two tools:
  `device.set_torch` (on/off) and `device.set_brightness`.
- Flashlight via `expo-camera`'s `CameraView` `enableTorch` prop (iOS
  `AVCaptureDevice.torchMode`, Android `CameraManager.setTorchMode()` under
  the hood). Requires the standard camera permission on both platforms even
  though nothing is captured or stored.
- Brightness via `expo-brightness`, scoped to **app-window brightness only**
  — not system-wide. System-wide writes on Android require `WRITE_SETTINGS`,
  a special permission granted through a system settings screen rather than
  a normal runtime dialog; app-window brightness needs neither that nor any
  special permission on either platform.

**Dependencies:** Task 2.6 (Tier 3 scaffolding).

**Review checklist:**

- Asking the model to turn on/off the flashlight visibly does so on a
  physical device, on both platforms.
- Asking the model to change brightness visibly does so, scoped to the app's
  own window.
- Revoking this connector's permission does not affect any other
  connector's permission or vice versa.

**Explicitly out of scope:** alarm creation, listing, or deletion — see
research 0009's findings; not a gap to close later, a capability that
doesn't meaningfully exist to build against on either platform.

## Related Docs

- [research 0001](../../research/0001-concept-and-connector-architecture.md)
- [research 0009](../../research/0009-device-connector.md)
- [Connector Framework](connector-framework.md) (task 2.6, the Tier 3
  scaffolding this epic depends on)

## Cross-references

- Shares its Tier 3 dependency (task 2.6) with the
  [Calendar connector](calendar-connector.md) (epic 10).
