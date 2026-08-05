# Research 0008 — Health connector: why "step count" isn't HealthKit

**Status:** Decided (redefine scope) — parked pending a paid Apple Developer
account for anything beyond step count\
**Date:** August 2026\
**Author:** Claude Code (session with the developer)\
**Scope:** Candidate connector — health data, proposed to start from step
count\
**Related:** [research 0002](0002-react-native-framework-choice.md) (the
"no EAS, project holds its own keys" decision — unrelated mechanism, same
kind of paid-account dependency), task 0.3 / epic
[Infrastructure](../epics/infrastructure.md) (established that this project
currently has only a free Apple Personal Team, no paid Developer Program
membership)

---

## Question

Is a Health connector — starting from step count — buildable given this
project's current Apple account status, and what would the full version
(beyond steps) actually require?

## Findings

- **iOS HealthKit read access requires the `com.apple.developer.healthkit`
  entitlement on the App ID.** Entitlements are provisioned through the
  Apple Developer Portal and are **not available to a free Personal Team**.
  Task 0.3 (native build tooling) established that this project is currently
  signed in with exactly that — free team `8CJGS4873L`, no paid Apple
  Developer Program membership. This is a hard blocker for HealthKit, not a
  scoping choice: the iOS half cannot be built at all until that membership
  exists.
- No first-party Expo SDK module for HealthKit exists. The nearest precedent
  in this repo is `modules/sovereign-hashing` (task 0.5) — a hand-rolled
  native Expo module written because no existing package was fast enough.
  A HealthKit module would follow the same shape (native Swift + a JS
  bridge + a config plugin adding the entitlement and
  `NSHealthShareUsageDescription`), but HealthKit's query/authorization/
  background-delivery surface is a real subsystem, a meaningfully bigger
  native-code lift than a stateless hashing function.
- **Android's Health Connect** (the current unified health API, superseding
  Google Fit for new integrations) can read step count via `StepsRecord`,
  again with no first-party Expo module — a community package or custom
  module either way. Health Connect itself is bundled on Android 14+ but
  needs a separate Play Store install on Android 9–13, an install-time
  dependency this app doesn't control.
- **Step count specifically has a lighter path that skips both frameworks
  entirely.** iOS Core Motion's `CMPedometer` reads step count straight from
  the motion coprocessor, no HealthKit involved, needing only
  `NSMotionUsageDescription` — no entitlement. Android's step-count sensor
  (`TYPE_STEP_COUNTER`/`TYPE_STEP_DETECTOR`) is a plain sensor, not a Health
  Connect query. Both are already exposed via `expo-sensors`' `Pedometer` —
  an installable Expo package, no custom native module, no entitlement, no
  paid account.
- This means **"Health connector, starting with step count" and "a
  HealthKit/Health Connect connector" are not the same task.** The former is
  achievable today via `expo-sensors`; the latter is blocked. Naming the
  step-count feature a "Health connector" would misstate what was actually
  built and imply access to a framework (heart rate, sleep, workouts) that
  isn't there.
- Tradeoff of the Pedometer path: it only ever gives step count (and on iOS,
  some derived distance/flights-climbed data) — it is not a foothold toward
  the broader Health framework. Getting there later still requires the
  entitlement/paid-account/custom-module work described above.

## Options considered

**A. Build against HealthKit/Health Connect now, for step count.** Not
viable today — blocked on the iOS entitlement/paid account; would also ship
Android-only in the interim, which this repo's own "both platforms" bar
(task 0.1's review checklist) treats as incomplete.

**B. Build step count via `expo-sensors`' Pedometer, named and scoped
explicitly as "step count," not "Health data." Defer the broader Health
connector until a paid Apple Developer Program membership exists.**

**C. Park all health/step work until the paid-account question resolves, to
avoid shipping two different things under one name.**

## Recommendation

Option B. It delivers the stated MVP today, on both platforms, with no
entitlement blocker, using an already-installable package — but it should be
named and scoped as a step-count feature, not marketed or documented as a
"Health connector," so the name doesn't imply HealthKit/Health Connect access
that hasn't been built.

## Decisions

- Step count ships via `expo-sensors` Pedometer, not HealthKit/Health
  Connect.
- The broader Health connector (heart rate, sleep, workouts — genuine
  HealthKit/Health Connect access) is parked until a paid Apple Developer
  Program membership exists. No epic file for that broader scope until then.
- Likely modeled as a read-only query tool (e.g. `device.get_step_count`),
  not a create/update/delete surface like Calendar or Tasks.
- **Resolved, per [0005](0005-calendar-connector.md)'s reading of the actual
  implementation:** this is a Tier 3 connector — a native sensor read, not an
  HTTP call, same as Calendar and Device. It shares the same unbuilt
  prerequisite (Tier 3 manifest schema variant, generalized grant scope,
  `case 3` runtime dispatch), plus one wrinkle the other two don't have: it's
  read-only, so its "scope" is closer to a capability name than an
  origin-shaped permission — worth confirming the generalized grant-scope
  design (settled once, in the shared Tier 3 work) actually covers a
  read-only capability cleanly, not just write-oriented ones like
  `calendar.write` or `device.set_torch`.

## Open questions

- Android step-counter sensor reliability/availability varies by OEM
  (flagged in the earlier phone-capabilities conversation) — worth a real
  multi-device check before claiming platform parity.

## Next steps

Blocked on the same Tier 3 scaffolding as Calendar and Device — see
[0005](0005-calendar-connector.md#next-steps). If step-count-only is
approved, this is smaller and lower-risk than the Calendar connector once
that scaffolding exists.
