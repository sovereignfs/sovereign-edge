# Network audit

**Version:** 0.1.19 · **Last updated:** 2026-08-06

Sovereign Edge claims that your conversations never leave your device. This
document is how you check that claim yourself rather than take our word for
it. Every assertion below names the command that reproduces it, and every
mechanism states what it does **not** cover.

An audit that overclaims is worse than no audit, because it transfers trust
that was never earned. Where the guarantee stops, this document says so.

**Scope: `apps/mobile`**, the only app this claim has been built and verified
against so far. All commands below assume `cd apps/mobile` first — this repo
became a pnpm workspace partway through this audit's history, and `src/`,
`ios/`, `android/`, and `node_modules/` below are all relative to that
directory, not the repo root. If `apps/desktop` ever implements its own
chat/model path, it needs this same audit written against its own mechanisms
— nothing here covers it by extension.

## What is actually claimed

The app is not "offline". It downloads model weights over HTTPS, and the
connector framework makes network calls on your behalf when you grant a
Tier 1 connector (Search, today) permission to. Claiming otherwise would be
a lie you could disprove in a minute with a packet capture.

The claim is narrower and checkable:

| Module            | Network                 | Why                                                                                                                            |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/chat/`       | **Never**               | Conversations, prompts, and replies. This is the claim.                                                                        |
| `src/models/`     | **User-initiated only** | _Acquiring_ a model is a download you started and can see. _Using_ one never touches the network.                              |
| `src/connectors/` | **Per-grant only**      | Every outbound call sits behind an explicit, separately revocable permission. The Search connector (Tier 1) ships and reaches the network only once granted. Tier 3 connectors (Calendar, Device — planned, epic 2 task 2.6) call on-device OS APIs instead of `fetch` and are expected to touch no network at all; re-verify that expectation against the runtime once task 2.6 ships, don't take it on faith. |
| everything else   | **Never**               | `design-system/`, `shared/`, and `settings/` are inside the boundary by transitivity, because `chat/` imports them.            |

Stated as one sentence: **no code path reachable from `src/chat/` can open a
socket.**

## How it is enforced

Four mechanisms, each with a different blind spot. None is sufficient alone;
the list of what each misses is the honest part.

### 1. Restricted imports (ESLint)

`eslint.config.js` denies network-capable modules to files under `src/chat/`:
`expo-file-system` (it carries `DownloadTask`), `expo-network`, `expo/fetch`,
HTTP clients, and any path into `src/models/` or `src/connectors/`.

```bash
pnpm lint
```

**Misses:** globals that need no import; anything more than one file away.

### 2. Restricted globals (ESLint)

`fetch`, `XMLHttpRequest`, `WebSocket`, and `EventSource` are ambient in React
Native — a file can reach the network without importing anything. This is the
likeliest way the boundary breaks, and import rules alone would not see it.
`navigator.sendBeacon` and `globalThis.fetch` are covered too.

```bash
pnpm lint
```

**Misses:** an indirect reference that never names the global (`const f =
global['fet' + 'ch']`); anything more than one file away.

### 3. Module-graph check (CI)

ESLint reads one file at a time. It cannot tell that `src/chat/` imports a
helper that imports another helper that imports the downloader.
`scripts/ci/check-offline-boundary.js` walks the import graph from every file
under `src/chat/`, using the TypeScript compiler's own preprocessor, and fails
if the closure reaches `src/models/`, `src/connectors/`, or a networked
package. It reports the shortest chain, so the output names the edge to cut.

```bash
pnpm check:offline
```

**Misses:** dependencies. The walk covers first-party source only — a package
that reaches the network without any first-party file importing it is not
seen. See _Known gaps_.

### 4. Runtime tripwire (development only)

`src/chat/session/offlineTripwire.ts` replaces the network globals with
throwing stubs, armed from `App.tsx`. It catches paths that only exist at
runtime.

**It does not ship in Release builds**, and that is deliberate. Failing closed
in production would turn a boundary violation into a crash in your hands, on a
code path never exercised in testing. A violation reaching Release means the
checks above already failed — that is the bug to fix, and crashing the app
punishes you for it. `jest.setup.js` applies the same guard to the test suite.

**Misses:** everything in a Release build; native code.

## Every mechanism has been watched failing

A guard nobody has seen fail is not evidence. Each was verified by deliberately
breaking it, confirming it failed for the stated reason, and reverting.

| Threat                                    | Probe                                                                | Result                                                    |
| ----------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| Direct import                             | `import { File } from 'expo-file-system'` in `src/chat/`             | ESLint error naming the module and the reason              |
| Import of `src/models/`                   | `import { ModelManager } from '@/models'`                            | ESLint error pointing at `ChatSessionContext`              |
| HTTP client                               | `import axios from 'axios'`                                          | ESLint error                                               |
| Ambient globals                           | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`  | Five separate ESLint errors                                |
| `globalThis.fetch`                        | `globalThis.fetch(...)`                                              | ESLint error                                               |
| **Transitive escape**                     | `chat/ → shared/helper → @/models`                                   | **ESLint clean (0 errors)**; graph check failed, printing the full three-step chain |

The last row is the one that matters: it is the case lint provably cannot see,
and the reason mechanism 3 exists.

## Platform permissions

The OS cannot enforce this boundary. `android.permission.INTERNET` is
app-wide and genuinely required for model downloads, so it cannot be dropped;
iOS has no per-module network entitlement. **Do not read the permission list
as the OS enforcing the offline claim — it is not.** The module boundary above
is the enforcement.

What the app declares, and why:

**A Release build of Sovereign Edge declares exactly one Android permission:
`INTERNET`.**

| Permission               | Release     | Reason                                                                                        |
| ------------------------ | ----------- | --------------------------------------------------------------------------------------------- |
| `INTERNET`               | **Kept**    | Model downloads, and future connectors. Cannot be scoped per-module.                          |
| `SYSTEM_ALERT_WINDOW`    | **Absent**  | Draw over other apps. React Native's debug overlay adds it to _debug_ builds only.            |
| `VIBRATE`                | **Removed** | Pulled in by a dependency; unused.                                                            |
| `READ_EXTERNAL_STORAGE`  | **Removed** | Models live in app-private storage.                                                           |
| `WRITE_EXTERNAL_STORAGE` | **Removed** | As above.                                                                                     |
| `USE_BIOMETRIC`          | **Removed** | Added by `expo-secure-store`. Its `requireAuthentication` option is not used.                 |
| `USE_FINGERPRINT`        | **Removed** | As above.                                                                                     |

Removals come from `android.blockedPermissions` in `app.json`, which emits
`tools:node="remove"` into the generated manifest. `ios/` and `android/` are
generated, so `app.json` is the source of truth.

**Check the merged manifest, not the source one.** The source manifest still
lists blocked permissions, carrying a `tools:node="remove"` attribute — the
merger is what acts on it, and only the merged output tells you what ships:

```bash
pnpm prebuild
cd android && ./gradlew :app:processReleaseMainManifest -q && cd ..
grep -o 'android:name="android.permission[^"]*"' \
  android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml \
  | sort -u
```

Expected output, in full:

```
android:name="android.permission.INTERNET"
```

Running the same against the `debug` variant additionally shows
`SYSTEM_ALERT_WINDOW`. That is the development overlay, and it is worth
knowing the two variants differ before concluding a debug APK is what users
receive.

**Re-run this whenever a native dependency is added.** It has already caught
one regression: adding `expo-secure-store` for connector credentials (task
2.2) silently introduced `USE_BIOMETRIC` and `USE_FINGERPRINT`, invalidating
the claim above within hours of it being written. A library's manifest merges
into yours without asking, so the permission list is not a property of your
own code and cannot be reasoned about from it.

iOS App Transport Security sets `NSAllowsArbitraryLoads: false`, so cleartext
HTTP is refused. `NSAllowsLocalNetworking: true` is **kept deliberately**: the
planned Sovereign Tasks connector talks to your self-hosted instance, which
commonly sits on your own LAN. It is a connector requirement, not a leftover
from the development server.

## Dependencies

Audited: exactly what `src/chat/` reaches — `llama.rn`, `react`,
`react-native`, `react-native-safe-area-context`. That is the set the claim
depends on, and it is small enough to re-check when it changes.

### `llama.rn`

The inference engine, and the only dependency here with native code and
prebuilt binaries. **It links nothing network-capable.**

```bash
nm -u node_modules/llama.rn/ios/rnllama.xcframework/ios-arm64/rnllama.framework/rnllama \
  | grep -iE 'socket|connect|getaddrinfo|NSURLSession|curl_'
nm -u node_modules/llama.rn/android/src/main/jniLibs/arm64-v8a/librnllama.so \
  | grep -iE 'socket|connect|getaddrinfo|curl_'
```

Both produce no output: **zero undefined network symbols**. A library that
opens a socket must import those from the system. The sources contain no
`NSURLSession`, `HttpURLConnection`, `OkHttp`, or `java.net.*`, and the
bundled C++ has no `sys/socket.h` or `curl` includes — upstream llama.cpp's
optional `LLAMA_CURL` model downloader is not compiled in.

The binaries do contain URL-shaped strings (GitHub links from source comments,
and `https://huggingface.co/` from model-spec parsing). They are inert without
socket symbols to act on them.

**Limits of this evidence:** it covers the arm64 artifacts, via `nm` and
`strings`. A `dlsym`-based lookup would evade it. The claim being made is "we
checked the imports table", not "we proved it cannot".

## Known gaps

Listed because you should know where to be sceptical.

1. **Bundle-level analysis is not implemented.** The graph check reads
   first-party source, not what Metro actually ships. A dependency reaching
   the network without any first-party import is not caught. Tracked as
   follow-up work.
2. **Dependency updates.** A transitive package could start phoning home in a
   patch release. Nothing here detects that.
3. **Native code added later.** No JavaScript check sees a socket opened in
   Swift or Kotlin. `llama.rn` was audited by hand; a future native module
   would need the same treatment, and nothing forces that.
4. **Release builds have no runtime guard**, by the deliberate choice
   explained above.
5. **This is a source audit, not a traffic capture.** The strongest check
   available to you is independent of all of the above: put the device in
   airplane mode and use the app. Chat works. That is the claim.

## Reproducing everything

```bash
cd apps/mobile   # or run from the repo root — pnpm install resolves the whole workspace either way
pnpm install --frozen-lockfile
pnpm lint            # mechanisms 1 and 2
pnpm check:offline   # mechanism 3
pnpm test            # suite runs with fetch stubbed to throw

# Permissions, from the merged Release manifest — see the section above for
# why the source manifest is the wrong file to read.
pnpm prebuild
cd android && ./gradlew :app:processReleaseMainManifest -q && cd ..
grep -o 'android:name="android.permission[^"]*"' \
  android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml \
  | sort -u
```

No step needs network access beyond the package registry, and none downloads
model weights.

## Related

- [research 0001](research/0001-concept-and-connector-architecture.md) — where
  the offline guarantee is specified
- [epic 1, task 1.5](epics/mobile/core-inference-chat.md) — threat model and the
  decisions behind each mechanism
- [AGENTS.md](../AGENTS.md) — the shared hard architectural rules this
  enforces; [apps/mobile/AGENTS.md](../apps/mobile/AGENTS.md) for this app's
  concrete enforcement mechanism
