# Epic: Infrastructure

> Repo scaffold, RN project setup, CI, and build tooling for iOS/Android.

## Status

⏳ In Progress

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
- ✅ Verification is chosen from measurement rather than assumption — see
  [research 0003](../research/0003-model-verification-hashing.md). Originally
  size + native MD5 (128 MB in ~500 ms, digest matching the host exactly);
  superseded by task 0.5, which made publisher-published SHA-256 both stronger
  and faster.

---

#### ✅ 0.5 — Native SHA-256 hashing

**Goal:** Verify downloaded models against the digest their publisher actually
publishes, at a speed that is usable on a phone.

**Why this exists:** `expo-file-system` hashes MD5 natively but SHA-256 only
in JavaScript, which measured 1.1 MB/s on device — about an hour per 4 GB.
Task 0.4 therefore defaulted to MD5. Task 1.2 then showed the cost of that:
model publishers publish SHA-256 and never MD5, so an MD5 in the catalog can
only come from a maintainer downloading the file and computing it, which
certifies "matches what we downloaded" rather than "matches what the
publisher published". Native SHA-256 removes the trade-off instead of
managing it.

**Deliverables:**

- A local Expo module exposing streaming SHA-256 over a file path, backed by
  `CryptoKit` on iOS and `MessageDigest` on Android.
- `verifyFile()` uses it as the default digest, with the JS implementation
  retained as a fallback and as a cross-check.
- Catalog entries verified against publisher SHA-256 without opting into a
  slow path.

**Dependencies:** Task 0.4, Task 1.2.

**Review checklist:**

- ✅ Hashing on device completes in seconds and the digest is correct.
  Measured 762–932 MB/s on Android and 599 MB/s on iOS against a 25 MB file —
  roughly 5–7 s for a 4 GB model, and about 10× faster than
  `expo-file-system`'s native MD5, so the stronger digest is now also the
  cheapest. A known-answer test returns the published SHA-256 of `"abc"`
  exactly, and `CryptoKit`, `MessageDigest`, and `@noble/hashes` all agree on
  the same file. A missing file rejects cleanly rather than crashing.

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)
- [research 0003](../research/0003-model-verification-hashing.md)
