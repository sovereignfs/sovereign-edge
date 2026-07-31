# Research 0003 — Model download verification: why MD5, not SHA-256

**Status:** Decided\
**Date:** July 2026\
**Author:** Claude Code (session with the developer)\
**Scope:** Task 0.1.4 / epic [0.4](../epics/infrastructure.md) — how downloaded
GGUF weights are verified on device\
**Related:** [0001](0001-concept-and-connector-architecture.md) (model assets
never bundled), [0002](0002-react-native-framework-choice.md) (Expo chosen
partly *because* `expo-file-system` provides resumable downloads).

---

## Question

Epic 0.4 requires "checksum verification" of downloaded GGUF files. SHA-256 is
the obvious default, and it is what model hosts publish. Is it actually
usable on a phone for a multi-gigabyte file?

## Findings

### `expo-file-system` hashes natively for MD5 only

`File.info({ md5: true })` is computed in native code. There is no native
SHA-256 for files, and `expo-crypto`'s `digest()` takes a whole `BufferSource`
— which for a 4 GB model would mean holding it in memory. So SHA-256 has to be
streamed and hashed in JavaScript.

### Measured, not assumed

The first implementation streamed SHA-256 via `@noble/hashes`. Benchmarked on
an Android emulator (Pixel-class AVD, arm64, API 36) against a 128 MB file:

| Operation                    | Throughput   | Extrapolated to 4 GB |
| ---------------------------- | ------------ | -------------------- |
| Native MD5                   | 74.5 MB/s    | ~1 min               |
| Stream read, no hashing      | 6.2 MB/s     | ~11 min              |
| Stream read + SHA-256 in JS  | 1.1 MB/s     | **~61 min**          |

Two independent problems, and it matters that they are separate:

1. **The stream arrives in 1 KB chunks** — 131,072 of them for 128 MB. That
   bridge crossing alone costs ~20s per 128 MB before any hashing.
2. **SHA-256 in Hermes runs at roughly 1.4 MB/s.** Even with chunking fixed,
   hashing alone still puts 4 GB at ~48 minutes.

So this is not a tuning problem. An hour of verification on top of an hour of
downloading is not a shippable experience, and a foregrounded hour-long CPU
burn on a phone will be killed by the OS or destroy the battery first.

A later measurement of native MD5 on an already-read file reported 256 MB/s
against 74.5 MB/s for the first run — almost certainly OS page cache. The
conservative 74.5 MB/s figure is the one to plan against.

### MD5's weakness is the wrong weakness to worry about here

MD5 is widely described as "broken", but the broken property is **collision
resistance**: an attacker crafts *two* files with the same digest. That helps
an attacker who controls what digest gets published — i.e. a hostile model
publisher — and against that threat a stronger hash in this app changes
nothing, because the descriptor would carry the attacker's digest either way.

The property this pipeline actually relies on is **second-preimage
resistance**: given the publisher's file and its published digest, produce a
*different* file with the same digest. MD5 has no practical second-preimage
attack. Combined with an exact size check and HTTPS transport, MD5 is
sufficient for what verification is really defending against here — a corrupt
or truncated download, or a mirror serving the wrong file.

## Options considered

### A. Native MD5 by default, SHA-256 available but opt-in (recommended)

Size and MD5 on every download (~1 min per 4 GB). `sha256` stays in the
descriptor and is checked only under `deep: true`, at the measured cost.

### B. Ship a native SHA-256 module now

A small Expo native module over `CommonCrypto` (iOS) and `MessageDigest`
(Android) would give SHA-256 at native speed. It is the strongest outcome and
the eventual destination — but it pulls native-module work into a task scoped
as pure infrastructure, and needs a build/verify cycle on both platforms.
Deferred, not rejected.

### C. Keep SHA-256 in JavaScript

Rejected on the measurements above.

## Decisions

- **Default verification is size + native MD5.** Fast enough to run on every
  download, and sound for the threat it actually addresses.
- **`ModelDescriptor.md5` is required; `sha256` is optional.** Descriptors
  carry SHA-256 when the publisher offers one, so nothing is lost when a
  native implementation lands.
- **`deep: true` verifies SHA-256**, with the cost documented at the call
  site rather than buried.
- **Verification order is cheapest-first**: size, then MD5, then SHA-256. A
  truncated file fails instantly instead of after minutes of hashing.

## Open questions

- **Native SHA-256 module.** Roughly 40 lines per platform. Once it exists,
  SHA-256 becomes the default and this document's trade-off goes away. Worth
  scheduling before the connector SDK opens the app to third-party content.
- **The 1 KB stream chunk size.** Costs ~11 min per 4 GB just to read a file.
  Irrelevant while MD5 is native and needs no stream, but it will matter for
  any future feature that reads model files from JavaScript.
- **Real-device throughput.** All figures above are from an emulator sharing a
  busy host. A physical device should be measured before these numbers are
  quoted anywhere user-facing.

## Notes from verification

Testing this end-to-end required an HTTP origin supporting **Range requests**
— without them resume cannot work at all — plus bandwidth throttling and a
"go quiet without closing the socket" mode. `python3 -m http.server` supports
none of these.

That exercise found a real bug that unit tests could not: calling
`pauseAsync()` on a stalled download causes the in-flight `downloadAsync()` to
resolve with `null`, which raced ahead of the stall handler and surfaced as
`code: 'network'` — "the download ended without producing a file" — hiding
both the true cause and the fact that the transfer was resumable. The unit
test mocked the download as never-resolving, so the race could not occur
there. It is now covered by an explicit regression test.
