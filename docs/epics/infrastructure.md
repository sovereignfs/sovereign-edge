# Epic: Infrastructure

> Repo scaffold, RN project setup, CI, and build tooling for iOS/Android.

## Status

📋 Planned

## Overview

Everything needed before feature work can start: the React Native project
itself, shared TypeScript/lint/format config, CI, and the native build
tooling for both platforms. No product feature lives here.

## Tasks

#### ✅ 0.1 — Repo scaffold

**Goal:** Stand up the React Native project this whole app is built on.

**Deliverables:**

- React Native project (TypeScript template), targeting iOS + Android.
- Shared TS/ESLint/Prettier config, matching the wider `sovereignfs`
  ecosystem's conventions where they translate (single-quotes, semicolons,
  Prettier as formatting source of truth).
- Baseline folder structure: chat/inference module, connector framework
  module, settings/UI module — matching the epic split in this directory so
  code structure and planning structure stay aligned.

**Dependencies:** none — first task.

**Review checklist:**

- ✅ Boots a blank app on both platforms' simulators/emulators. Verified by
  the `Native build` workflow rather than locally — it builds Release,
  installs, launches, and asserts the process is still alive ten seconds
  later on both an iOS simulator and an Android emulator. See the decision
  in [research 0002](../research/0002-react-native-framework-choice.md).

---

#### ✅ 0.2 — CI pipeline

**Goal:** Lint, typecheck, and test on every PR.

**Deliverables:**

- CI workflow running lint, typecheck, and unit tests.
- No model download or real inference in CI — mirrors `sovereign`'s Core
  Assistant precedent of a deterministic fake provider so CI never depends on
  downloading GGUF weights.

**Dependencies:** Task 0.1.

**Review checklist:**

- ✅ CI fails on a lint/typecheck/test regression; CI does not require
  downloading any model weights. Two workflows: `CI` (lint, format,
  typecheck, test) on every PR, and `Native build` (build and launch on both
  platforms) on main and manual dispatch, kept separate so the slow native
  jobs do not gate every PR. Nothing fetches beyond the package registry, and
  `jest.setup.js` makes `fetch` throw so an accidental network call fails the
  run.

---

#### 📋 0.3 — Native build tooling

**Goal:** Reliable, repeatable native builds for both platforms.

**Deliverables:**

- Xcode project configuration (signing, capabilities placeholder for future
  Tier 3 native modules).
- Gradle configuration for Android.
- A build/release script or CI job producing installable builds for internal
  testing (TestFlight / internal Play track).

**Dependencies:** Task 0.1.

**Review checklist:**

- A signed internal build installs and launches on a physical device on both
  platforms.

---

#### ✅ 0.4 — Model asset pipeline

**Goal:** Infrastructure for getting GGUF model weights onto a user's device
without bundling them into the app binary.

**Deliverables:**

- Runtime download-and-verify flow for GGUF files (checksum verification,
  resumable download — addressing the exact failure mode the developer hit
  trying OGAM).
- On-device storage management (where models live, how they're listed,
  how they're deleted to reclaim space).
- No model weights committed to the repo or bundled into the app binary.

**Dependencies:** Task 0.1.

**Review checklist:**

- ✅ A model download survives an interrupted connection and resumes or fails
  cleanly with a clear error, never a silent stuck state. Verified on an
  Android emulator against a local HTTP origin supporting Range requests,
  throttling, and a deliberate stall (a socket held open while sending
  nothing — distinct from a connection error). A stalled transfer failed with
  `code: 'stalled'` 16s after the last byte and was paused, not cancelled; the
  retry issued `Range: bytes=41943040-` and transferred only the remaining
  92 MB rather than restarting.
- ✅ Verification is size then native MD5, chosen from measurement rather than
  assumption — see
  [research 0003](../research/0003-model-verification-hashing.md). Verifying
  128 MB takes ~500 ms; the device-computed digest matched the host exactly.

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)
