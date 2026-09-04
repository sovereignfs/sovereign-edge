# AGENTS.md — apps/mobile

Mobile-specific conventions, commands, and environment quirks. Workspace-wide
rules (architecture, branching, versioning, docs) live in the
[root AGENTS.md](../../AGENTS.md) — read that first; this file only adds to
it, never restates it.

## What this is

The shipping product: a privacy-first, fully offline on-device AI companion
for iOS and Android. A local GGUF model runs on-device via `llama.rn`, with
zero network code in the chat path — see the root `AGENTS.md`'s Hard
architectural rules, which this app is the first (and currently only)
concrete implementation of.

## State of play

Accurate as of version 0.2.12. **[ROADMAP.md](../../ROADMAP.md) is
canonical** — if this section disagrees with it, this section is stale.

**Done.** The offline core is complete (epic 1, tasks 1.1–1.6): on-device
inference, model catalog with download/verify/switch, streaming chat UI,
writing-assist modes, model-choice persistence, and zero-network enforcement.
Design system (epic 7, 7.1–7.8 — including the warm cream/clay palette, the
icon system, and the app icon/splash assets) and app shell (8.1) are done.
The Connector Framework's Tier 1 shape is fully built and proven end to end
— manifest schema, permission/consent model, tool-routing, runtime host,
in-chat provenance (2.1–2.5) — with its first real connector shipped:
Search, including the explicit Search mode (epic 3, 3.1–3.3). Tier 3
scaffolding (2.6) landed after that, and both Tier 3 connectors built on it
are done: **Calendar** (epic 10) and **Device Utilities** (epic 11 —
brightness and torch). Phase 3's connector SDK, plugin template, public
registry, and in-app Connector Store (5.1–5.5) and the entitlement model
(6.1) are done too. Native build tooling (0.3) is done: declarative signing
on both platforms via `app.json` and a config plugin, local release scripts,
and a CI release workflow that's written but inert until secrets exist (see
_Blocked_ below — this task turned out **not** to need a paid account).

**Next**, in order (Phase 2): **4.1 — Sovereign Tasks connector**, then
**4.2 — instance URL and API token setup flow**. After that, Phase 3's
remaining open items are **5.6** (Tier 2 sandboxed script runtime) and
**6.2** (mobile in-app purchase integration).

For the Tier 3 background — why Calendar and Device Utilities were pulled
ahead of the Sovereign Tasks connector in the first place — see research
[0005](../../docs/research/0005-calendar-connector.md),
[0008](../../docs/research/0008-health-step-count.md), and
[0009](../../docs/research/0009-device-connector.md), including why
Files/PDF summarization and text-to-speech, two other capabilities surveyed
alongside these, turned out **not** to be connectors at all (research
[0006](../../docs/research/0006-files-document-summarization.md),
[0007](../../docs/research/0007-text-to-speech.md)).

**Blocked, still.** 8.2 (store release — actual App Store Connect / Play
Console listings) needs a paid Apple Developer Program membership and a
Google Play Console account; neither exists. **0.1.3 is no longer blocked**
— it shipped using the free Apple Personal Team already signed into Xcode on
the development Mac (team ID `8CJGS4873L`), sufficient for development-signed
builds but not TestFlight/Play internal-track distribution. Do not attempt
to enroll in a paid developer program, create App Store Connect/Play Console
accounts, or enter payment details — those remain the developer's to do.
Generating a local signing keystore, or building against an already-signed-in
free team's certificates, is fine — task 0.3 already did both.

**How 2.3's tool-routing gets its constrained output** (shipped; the
mechanism, from
[research 0004](../../docs/research/0004-connector-manifest-schema.md), is
worth knowing before you touch it):
`llama.rn` converts JSON Schema to a decoding grammar (`json_schema` on
`completion`), so constrained tool-call output comes free from a manifest's
`tool.parameters`. And `chatTemplates.jinja.defaultCaps.tools` reports
per-model whether the loaded model can call tools at all — which is what
2.3's required fallback message must be honest about, because it is a fact
about the *model*, not the connector.

### Environment quirks worth knowing before you burn time on them

- **The Android emulator does not survive an agent session.** Launched with
  `nohup … &` it still dies when background tasks are torn down. Resolve its
  serial **by AVD name**, never assume `emulator-5554` — another project's AVD
  has taken that serial mid-session and screenshots came back showing the
  wrong app.
- **Fast Refresh remounts providers.** `ModelSessionProvider` re-runs its
  bootstrap, which silently changed the active model mid-session and made the
  next tap on a Models row delete a 491 MB download instead of selecting it.
  Re-read the screen state after editing provider code.
- **Adding a native dependency changes the Android permission list** without
  touching your code. `expo-secure-store` added `USE_BIOMETRIC` and
  `USE_FINGERPRINT`. Always re-check the **merged Release** manifest, per
  [docs/network-audit.md](../../docs/network-audit.md) — the source manifest
  lists blocked permissions with `tools:node="remove"` and reports the
  opposite of the truth.
- **A debug build cannot answer "does this work offline"**, because it loads
  its JS from Metro over the LAN. Offline claims need a Release build.
- **CocoaPods crashes under the "C" locale.** `pod install` fails with a
  Ruby `Encoding::CompatibilityError` inside `unicode_normalize` if `LANG`/
  `LC_ALL` aren't set — the traceback names `verify_podfile_exists!`, which
  reads as a missing Podfile, not a locale problem. `export
  LANG=en_US.UTF-8` before building; `scripts/release/build-ios.sh` sets
  this itself so it doesn't depend on the calling shell.
- **Don't trust research 0002's "no Android SDK/JDK, CocoaPods can't
  install" note as still true for the current dev Mac.** Task 0.3 found
  Java 17 (Temurin), a real Android SDK (build-tools 36), and a working
  CocoaPods/Xcode toolchain already present. That note described a specific
  past machine state, not a permanent constraint — check what's actually
  installed (`java -version`, `ls ~/Library/Android/sdk`,
  `security find-identity -v -p codesigning`) rather than assuming either
  way.
- **Only one Apple ID/team may be signed into Xcode at a time, and it may
  not match `app.json`'s `appleTeamId`.** The project previously had a
  different (paid-looking) team ID hardcoded before task 0.3; the Mac was
  actually only signed into a free Personal Team. Check
  `security find-identity -v -p codesigning` and Xcode's own
  `IDEProvisioningTeamByIdentifier` prefs before assuming the team ID in
  `app.json` is the one that will actually sign a build.

## Mobile-specific architectural rules

These extend the root `AGENTS.md`'s Hard architectural rules — read those
first. This app is where rules 1–3 there are concretely enforced, plus two
rules that only make sense for this tech stack:

- **`src/chat/` must not import anything that opens a socket** (root rule 1).
  Enforced rather than intended (task 1.5): ESLint restricts both imports and
  the ambient network globals under `src/chat/`, and `pnpm check:offline`
  walks the import graph in CI to catch a transitive route that lint cannot
  see. [docs/network-audit.md](../../docs/network-audit.md) records what each
  mechanism does **and does not** cover — read it before assuming a check
  guarantees more than it does.
- **No `expo-updates`, ever.** Over-the-air JavaScript delivery would mean
  the running code is not the audited, store-reviewed binary — which
  contradicts the verifiability the product is built on. See
  [research 0002](../../docs/research/0002-react-native-framework-choice.md).
- **No EAS Build.** Builds run locally or in GitHub Actions; the project
  holds its own signing keys.

## Native project rules

- **`ios/` and `android/` are generated, not committed.** `app.json` plus Expo
  config plugins are the source of truth; `expo prebuild` regenerates the
  native projects. Hand-edits inside `ios/` or `android/` are lost on the next
  prebuild — native configuration belongs in `app.json` or a config plugin.
- **Adding a native module requires a rebuild**, not just a Metro reload. A
  JS-only reload will appear to work until the native module is called.
- **Bumping the version requires `pnpm prebuild`.** `expo run:ios` and
  `run:android` do _not_ re-run prebuild when the native directory already
  exists, so a version bump in `app.json` never reaches `Info.plist` or
  `build.gradle` on its own. This has already bitten once: with the native
  version stale, an old install and a new one were indistinguishable on a test
  device, and the only trustworthy evidence was `APP_VERSION` on the Settings
  screen, which is compiled into the JS bundle. `src/shared/app-info.test.ts`
  locks the three JS-side copies together, but it cannot see the generated
  files. The four-file agreement this app's version bump requires:
  `package.json`, `app.json`, `src/shared/app-info.ts`, and `ROADMAP.md`'s
  `Version:` header (root repo).
- **Expo Go is not a supported workflow.** `llama.rn` is a native module, so a
  development build is the only path.

## Verification

Tests and typecheck are necessary, not sufficient. Two failures in this repo's
history were invisible to a green test suite:

- A stall watchdog reported `code: 'network'` instead of `code: 'stalled'`,
  because `pauseAsync()` makes the in-flight `downloadAsync()` resolve `null`
  and win the race. The unit test mocked the download as never-resolving, so
  the race could not occur there.
- `expo prebuild` exits 0 when its internal `pod install` fails, and the
  missing `.xcworkspace` only surfaces one step later as a confusing
  `xcodebuild` error.
- The Models screen shipped with no way to download a model, making a fresh
  install a dead end. Every test device already had model files left behind by
  an earlier task, so the state a new user actually starts in was never once
  observed. **Verify on a device with no prior app state**, and prefer both
  platforms — this surfaced on the first Android emulator run, after iOS had
  been signed off.

So: **exercise the behaviour, and check the artefact rather than the exit
code.** For anything with a runtime surface, drive it on a simulator or
emulator. The `Native build` workflow does this for app launch; the model
pipeline was verified against a local HTTP origin with Range support.

## Layout

```
src/
├── chat/           # inference engine, chat UI              (epic 1)
├── models/         # download, verify, on-device storage    (epic 0.4)
├── connectors/     # manifest, permissions, routing, host   (epic 2)
├── design-system/  # theme tokens, core components          (epic 7)
├── settings/       # navigation, settings, app shell        (epic 8)
└── shared/         # cross-module utilities
```

One directory per epic, so code structure and planning structure stay aligned.
See [src/README.md](src/README.md). Imports resolve through the `@/` alias.

## Commands

Run from this directory, or from the repo root via `pnpm <command>` — the
root `package.json` delegates the same names here since this is the only app
that ships today.

| Command               | Does                                            |
| ---------------------- | ----------------------------------------------- |
| `pnpm start`           | Metro bundler for an installed dev build        |
| `pnpm ios`             | Build and launch on an iOS simulator            |
| `pnpm android`         | Build and launch on an Android emulator         |
| `pnpm prebuild`        | Regenerate `ios/` and `android/`                |
| `pnpm test`            | Jest                                            |
| `pnpm typecheck`       | `tsc --noEmit`                                  |
| `pnpm lint`            | ESLint                                          |
| `pnpm check:offline`   | Import-graph walk from `src/chat/` (task 1.5)   |
| `pnpm format:check`    | Prettier check — repo-wide, run from the root   |

## Tech stack

Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript 6 · pnpm 11 ·
Node 24 · Jest via `jest-expo` · `llama.cpp`/GGUF via `llama.rn`.

Jest rather than the ecosystem's Vitest is a deliberate exception, recorded in
[research 0002](../../docs/research/0002-react-native-framework-choice.md).
