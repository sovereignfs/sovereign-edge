---
id: 3
title: "Model download verification: hashing strategy"
status: "Superseded in part — see Update: native SHA-256"
date: "July 2026"
author: "Claude Code (session with the developer)"
scope: mobile
summary: "Task 0.1.4 / epic 0.4 — how downloaded GGUF weights are verified on device"
---

# Research 0003 — Model download verification: hashing strategy

See [Update: native SHA-256](#update-native-sha-256-supersedes-the-md5-default)
for the superseding decision.

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

---

## Update: native SHA-256 supersedes the MD5 default

**Date:** July 2026 · **Epic task:** [0.5](../epics/mobile/infrastructure.md#-05--native-sha-256-hashing)

The MD5 default was correct given what was measurable at the time, and wrong
about the thing it did not check: **where catalog digests come from.**

Building the model catalog (task 1.2) made it obvious. Model publishers
publish SHA-256 — Hugging Face exposes it as `lfs.oid` on every GGUF — and
never MD5. So an MD5 in a catalog entry can only come from a maintainer
downloading the file and computing it, which certifies *"this matches what we
downloaded"* rather than *"this matches what the publisher published"*. That
is strictly weaker than checking the publisher's own digest, however fast it
runs. Of four catalog entries, exactly one had an MD5, and only because it had
been downloaded during task 1.1.

So the constraint was never really MD5-versus-SHA-256. It was
native-versus-JavaScript.

### Measured after implementing a native module

`modules/sovereign-hashing`, roughly 50 lines per platform over `CryptoKit`
and `MessageDigest`, on the same emulator as the original benchmarks:

| Implementation                          | Throughput       | 4 GB extrapolated |
| --------------------------------------- | ---------------- | ----------------- |
| **Native SHA-256, Android** (this module) | **762–932 MB/s** | **~5 s**          |
| **Native SHA-256, iOS** (this module)     | **599 MB/s**     | **~7 s**          |
| Native MD5 (`expo-file-system`)         | 74.5 MB/s        | ~1 min            |
| SHA-256 in JavaScript (`@noble`)        | 0.9–1.1 MB/s     | ~61 min           |

The JavaScript figure reproduced the original 1.1 MB/s measurement, which is
reassuring about both runs.

Two things worth noting. Native SHA-256 is roughly **10× faster than
`expo-file-system`'s native MD5**, so the stronger, publisher-authoritative
digest is now also the *cheapest* one — the trade-off the original decision
managed simply no longer exists. And the speedup over JavaScript is ~700×,
which is larger than a language gap alone explains: the JS path also pays for
a stream that arrives in 1 KB chunks across the JSI bridge.

### Verified, not assumed

- **Known-answer test:** the module returns the published SHA-256 of `"abc"`
  exactly.
- **Cross-check:** for the same 25 MB file, `CryptoKit` (iOS),
  `MessageDigest` (Android), and `@noble/hashes` (JavaScript) all produce the
  identical digest `1aa7c925…`. Three independent implementations agreeing is
  the evidence worth having: a fast-but-wrong hasher would be worse than none,
  so they check each other rather than the fast one being trusted alone.
- **Error path:** a missing file rejects cleanly instead of crashing.

### Revised decisions

- **SHA-256 is the default digest**, checked on every download, against the
  value the publisher published.
- **MD5 is retained but optional.** When a descriptor carries one it is still
  checked — it costs almost nothing and catches corruption early.
- **`deep` now means "permit the slow JavaScript path"**, not "check SHA-256".
  It matters only where the native module is unavailable.
- **The JavaScript implementation stays**, as the fallback for such builds and
  as the cross-check above.

### What this does not change

The reasoning about MD5's second-preimage resistance still stands — it was
never the weak point. What changed is that a stronger, publisher-authoritative
digest became free, and there is no longer a reason to reason about MD5's
properties at all.

---

## Update: measured on real hardware

**Date:** August 2026 · **Device:** iPhone 15 Pro (A17 Pro, 7.50 GB)

The figures above were all taken on an emulator, and this document said so —
"a physical device should be measured before these numbers are quoted anywhere
user-facing". That is now done, against the 491 MB Qwen2.5 0.5B model rather
than a 25 MB synthetic file.

| Implementation                    | Emulator     | iPhone 15 Pro |
| --------------------------------- | ------------ | ------------- |
| Native SHA-256 (this module)      | 599 MB/s     | **2204 MB/s** |
| Native MD5 (`expo-file-system`)   | 74.5 MB/s    | ~512 MB/s\*   |

\* Inferred: verifying the model with both digests took 960ms where SHA-256
alone took 223ms, so the MD5 pass accounts for roughly 737ms of 491 MB.

Two consequences.

**Native SHA-256 is ~4x faster than the native MD5 it replaced**, not merely
comparable. The gap is wider on real silicon than on the emulator, so the
task 0.5 decision is more clearly right than the original measurements
suggested.

**The catalog no longer carries MD5 at all.** One entry still had one, left
from when native MD5 was the only fast digest. Keeping it meant `verifyFile`
made two full passes over the file for no gain — the MD5 was both slower and
the weaker claim, being maintainer-computed rather than publisher-published.
Removing it roughly halves verification time and makes every catalog entry
uniform.

### Still unmeasured

Both devices available for testing have 8 GB of RAM, so the memory-fit
heuristic has still never been exercised near its boundary — `unsupported`
has only ever fired on a 3.8 GB emulator. That remains a guess.
