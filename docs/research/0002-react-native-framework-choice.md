---
id: 2
title: "React Native framework choice: Expo vs. Community CLI"
status: decided
date: "July 2026"
author: "Claude Code (session with the developer)"
scope: mobile
summary: "Task 0.1.1 / epic 0.1 — which React Native toolchain the repo scaffold is built on, and which parts of that toolchain's hosted services are deliberately excluded"
---

# Research 0002 — React Native framework choice: Expo vs. Community CLI

**Related:** [0001](0001-concept-and-connector-architecture.md) decided React
Native as the client framework but did not pick a toolchain. Affects epic
[Infrastructure](../epics/mobile/infrastructure.md) tasks 0.1–0.4 and epic
[Mobile App Shell](../epics/mobile/mobile-app-shell.md).

---

## Question

[0001](0001-concept-and-connector-architecture.md#decisions) committed to React
Native for iOS + Android from Phase 1, but left the toolchain unstated. Which
React Native framework should task 0.1.1 scaffold on — and does anything about
a sovereignty-first, provably-offline product argue against the ecosystem's
default answer?

## Findings

### The framework question is not the same question it was

The React Native core team no longer recommends bare `react-native init` for
new projects; the docs direct new apps to start with a framework, and name
Expo as the one they endorse. The historical objection to Expo for this
project's shape — "on-device `llama.cpp` needs native code, so we need bare
RN" — no longer holds:

- **`llama.rn` ships an Expo config plugin.** It takes
  `enableEntitlements`, `forceCxx20`, and `enableOpenCL` options for exactly
  the iOS/OpenCL native configuration this app needs. There is a known
  [ESM resolution bug](https://github.com/mybigday/llama.rn/issues/243) in
  plugin loading — a bug to work around, not an architectural wall.
- **Expo is no longer a one-way door.** `expo prebuild` generates real
  `ios/` and `android/` directories. Committing them at any point yields
  Community-CLI-equivalent native control while keeping the `expo-*` module
  library and config-plugin system — the escape hatch is always one command
  away, which is what makes adopting Expo low-risk rather than binding.

### What Expo concretely buys this specific roadmap

- **Task 0.4 (model asset pipeline).** The epic names resumable download plus
  checksum verification as the fix for the stuck-download failure the
  developer hit evaluating OGAM. `expo-file-system`'s
  `createDownloadResumable` is that primitive, already maintained and tested,
  rather than hand-rolled `RNFS` code.
- **Task 0.3 (native build tooling).** Signing, capabilities, and the Tier 3
  native-module placeholder become declarative config-plugin state instead of
  hand-edited Xcode project files that drift between machines.
- **Connector credential storage** (epics 2.2, 4.2). `expo-secure-store` is
  Keychain/Keystore-backed, matching 0001's "token stored in the OS keychain,
  scoped per-connector" decision.

### Where Expo's defaults conflict with the product's trust claim

Two of Expo's headline features are actively wrong for this product, and both
are opt-out rather than opt-in:

- **`expo-updates` (OTA JavaScript delivery)** means the code actually running
  is not the code in the audited, store-reviewed binary. For an AGPL product
  whose entire proposition is verifiable local-only execution, a hot-swap
  channel undercuts task [1.5 / 0.1.12](../epics/mobile/core-inference-chat.md)
  (zero-network enforcement and audit) at the concept level, not merely at the
  packet level. It is also, unavoidably, a network callback in an app that
  claims to make none.
- **EAS Build** is a hosted third-party build service that would hold the
  project's signing keys. For a sovereignty-branded project that is an
  avoidable custody question; `eas build --local` or plain GitHub Actions
  produces the same artifacts without it.

The residual cost of choosing Expo is a larger dependency surface for
0.1.12's audit to cover. That audit is empirical either way — run the app
under packet capture, assert zero egress outside a granted connector — so the
cost is breadth of review, not a different kind of work.

## Options considered

### A. Expo, with continuous native generation (recommended)

Full `expo-*` module library and config plugins, no dependency on Expo's
hosted services. Ecosystem-default tooling, which matters for a solo/small-
team Phase 1.

`ios/` and `android/` stay **generated, not committed**. Committing them
alongside `prebuild` is the worst of both worlds: `prebuild` overwrites
hand-edits, so the native projects become a source of merge noise and silent
drift — exactly the failure mode that choosing Expo was meant to avoid. With
CNG, `app.json` plus config plugins are the single source of truth, which is
what makes task 0.3's "declarative native config" benefit real. Committing
them remains available later as a deliberate migration, not a default.

### B. `@react-native-community/cli` ("bare" React Native, no framework)

Smallest dependency surface, which is the one thing it wins on. Costs
hand-rolled equivalents of `expo-file-system`'s resumable downloads and
`expo-secure-store`, plus the well-known RN upgrade tax. Discouraged by
React Native's own docs for new apps.

### C. Rock (formerly React Native Enterprise Framework / `rnef`, by Callstack)

The only genuine third framework. Keeps bare native projects, adds a CLI,
pluggable bundlers, out-of-tree platform support, and native build caching
**hosted on your own infrastructure** via GitHub Actions — which maps
directly onto the EAS key-custody objection above. Rejected for now on two
grounds: it targets teams who have *outgrown* the Community CLI on large
modular codebases, and Callstack themselves point new projects at Expo. Its
self-hosted-build advantage is obtainable anyway via `expo prebuild` plus
GitHub Actions.

Worth remembering as the migration target if Expo's dependency surface ever
collides with 0.1.12. Migration is plausible precisely because both A and C
leave real native projects on disk.

### Not considered further

**Ignite** (Infinite Red) is frequently listed as an alternative but is a
boilerplate generated *on top of* Expo or the Community CLI — orthogonal to
this choice, layerable onto either.

## Recommendation

Adopt Option A: **Expo with `prebuild`, excluding `expo-updates` and EAS.**

Leave `expo-updates` out of the template from the first commit. Retrofitting
its absence later is harder than never adding it, and its presence would have
to be explained away in every subsequent claim the product makes about
offline verifiability.

## Decisions

- **Toolchain:** Expo, using continuous native generation. `ios/` and
  `android/` are gitignored and regenerated by `expo prebuild`; `app.json`
  plus config plugins are the source of truth for native configuration.
- **Boot verification happens in CI, not on a developer laptop.** The local
  machine can build neither platform — CocoaPods cannot be installed
  (Homebrew under `/opt/homebrew` belongs to a different macOS account;
  system Ruby is 2.6, below current CocoaPods' minimum), and no Android SDK
  or JDK exists. Rather than chase a per-laptop fix, epic
  [0.1](../epics/mobile/infrastructure.md)'s "boots on both platforms" check is
  satisfied by GitHub Actions runners, which ship CocoaPods, a JDK, and the
  Android SDK. This makes the check reproducible instead of dependent on one
  machine's setup, and it follows from the no-EAS decision above.
- **No `expo-updates`.** No over-the-air JavaScript delivery, ever. The
  shipped binary is the audited binary.
- **No EAS Build.** Builds run locally or in GitHub Actions (task 0.2); the
  project holds its own signing keys.
- **Expo Go is not a supported development path** — `llama.rn` requires a
  development build, so iOS/Android dev builds are the only workflow.
- **Test runner: Jest via `jest-expo`**, a deliberate exception to the
  ecosystem's Vitest 4 standard rather than drift. React Native ships Flow
  types in its own source and resolves modules Metro-style; Vitest needs
  preset and transform workarounds to cope, and those break on RN upgrades.
  `jest-expo` is maintained in lockstep with the SDK. The cost is one
  inconsistency with `sovereign-desktop`; the benefit is a test setup that
  survives SDK bumps without hand-holding.

## Open questions

- **Whether CI should also gate on a physical device.** The simulator and
  emulator checks in `native.yml` catch crash-on-startup, but not the
  device-only failures (memory pressure under a loaded GGUF model, thermal
  throttling) that matter most for on-device inference. Task 0.3 revisits
  this when real builds start going to TestFlight and the internal Play
  track.
- ~~**Whether the `llama.rn` config-plugin ESM bug is still live**~~ —
  **resolved.** Not present at `llama.rn` 0.12.8: the plugin resolves and
  `expo prebuild` completes with it active, and the Android build links
  `:llama.rn:assembleDebug` and packages `librnllama*.so` into the APK. No
  patch needed.
- **`llama.rn` ships prebuilt native binaries rather than building from
  source.** Its `postinstall` downloads `llama-rn-ios-xcframework.tar.gz` and
  `llama-rn-android-jni-libs.tar.gz`, which are too large for npm. For a
  product whose claim is verifiable local execution, the inference engine's
  binaries arriving over the network at install time is a supply-chain link
  worth a deliberate decision — accept them, pin and checksum them, or build
  from source. Unresolved.
- **Debug APK size grew from 130 MB to 226 MB** when `llama.rn` was added, as
  it ships a native library per CPU feature variant (v8, v8_2, dotprod, i8mm,
  hexagon, opencl) for both ABIs. A release build wants ABI splits and no
  x86_64 slice; revisit at task 0.3 or 8.2.
- **Local Android toolchain.** Nothing is installed — no SDK, no
  `ANDROID_HOME`, no Android Studio, no `adb`, and no Java runtime at all.
  Deferred deliberately: JDK plus the Android command-line tools unpack into
  `$HOME` without `sudo` or Homebrew, so this is unblocked whenever local
  Android work actually starts.

## Next steps

Task 0.1.1 scaffolds on this decision. Task 0.2 (CI pipeline) inherits the
"no EAS" constraint, must build on GitHub Actions runners, and now also
carries 0.1's boot check — 0.1.1 stays open until CI proves the app launches
on both platforms. Task 0.1.12
(zero-network enforcement and audit) should treat this doc's dependency-
surface caveat as a named input — the audit's scope includes every `expo-*`
package the app ends up shipping.
