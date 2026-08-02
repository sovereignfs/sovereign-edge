# Contributing to Sovereign Edge

Conventions here follow [`sovereign`'s](https://github.com/sovereignfs/sovereign)
`CONTRIBUTING.md` so that moving between ecosystem repos does not mean
relearning the rules. Where this repo differs, it is because it is a native
mobile app rather than a monorepo web runtime — those differences are called
out rather than left implicit.

Agent-facing guidance lives in [AGENTS.md](AGENTS.md); the task lifecycle is
in [docs/development-workflow.md](docs/development-workflow.md).

## Contents

- [Development setup](#development-setup)
- [Running the app](#running-the-app)
- [Running the tests](#running-the-tests)
- [Branching and commits](#branching-and-commits)
- [Pull requests](#pull-requests)
- [Continuous integration](#continuous-integration)
- [Proposing a change (research docs)](#proposing-a-change-research-docs)

---

## Development setup

Requirements:

- **Node 24.x** (see [.node-version](.node-version)) and **pnpm 11**
- **iOS:** macOS with **Xcode 26+** and CocoaPods
- **Android:** **JDK 17** and the Android SDK (API 34+)

```bash
git clone https://github.com/sovereignfs/sovereign-edge.git
cd sovereign-edge
pnpm install
```

### Three setup gotchas that cost real time

**Xcode 26 is a hard floor.** Expo SDK 57 pulls a Swift package requiring
Swift tools 6.2. Older Xcode fails at package resolution with an error naming
neither Expo nor React Native.

**A UTF-8 locale is required.** CocoaPods calls `String#unicode_normalize` on
the install path, which throws `Encoding::CompatibilityError` when `LANG` is
unset and Ruby falls back to ASCII-8BIT. The traceback points at
`verify_podfile_exists!`, so it reads as a missing Podfile. If `locale` shows
`LC_CTYPE="C"`:

```bash
export LANG=en_US.UTF-8   # or C.UTF-8
```

CI runners set this already, so it only bites locally.

**`expo prebuild` can exit 0 while its internal `pod install` fails.** The
`.xcworkspace` is created *by* `pod install`, so the first visible symptom is a
confusing `xcodebuild` error one step later. If an iOS build complains about a
missing workspace, check whether `ios/Pods` exists.

## Running the app

```bash
pnpm ios       # build and run on an iOS simulator
pnpm android   # build and run on an Android emulator
```

Both run `expo prebuild` first if needed, then compile natively. The first
build is slow; later builds are incremental.

**Expo Go does not work here, by design** — `llama.rn` is a native module, so
a development build is the only supported workflow.

Prefer `pnpm ios` over invoking `xcodebuild` directly. A bare
`xcodebuild -sdk iphonesimulator` with no `-destination` leaves
`ONLY_ACTIVE_ARCH` unable to resolve an active architecture and builds x86_64
too, which fails on Apple Silicon because Expo's prebuilt XCFrameworks ship no
x86_64 simulator slice.

**`ios/` and `android/` are generated, not committed.** `app.json` plus config
plugins are the source of truth. Hand-edits inside those directories are lost
at the next prebuild.

### Running on a physical iOS device

A free Apple ID is enough — the $99 Developer Program is not needed. Builds
signed this way expire after 7 days and must be reinstalled.

```bash
xcodebuild -workspace ios/SovereignEdge.xcworkspace -scheme SovereignEdge \
  -configuration Release -destination "id=<device-udid>" \
  -derivedDataPath ios/build-device DEVELOPMENT_TEAM=<team-id> \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build

xcrun devicectl device install app --device <device-udid> \
  ios/build-device/Build/Products/Release-iphoneos/SovereignEdge.app
```

Get the UDID from `xcrun xctrace list devices` — **not** from
`xcrun devicectl list devices`, which prints a CoreDevice UUID that tooling
will not match.

Four setup steps, each of which fails with an error naming something else:

**`0 valid identities found` — usually a missing intermediate, not a missing
key.** Apple Development certificates are issued by the WWDR **G3**
intermediate. If only the old G1 one is installed (it expired in 2023), the
chain cannot reach the Apple Root CA and macOS reports no valid identity even
though the certificate and its private key are both fine. Xcode also greys out
*Delete Certificate* in this state, which looks like a permissions problem.
Fix: install [AppleWWDRCAG3.cer](https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer).

**`No code signing certificates are available`** — the Apple ID is added but no
certificate exists yet. Xcode → Settings → Accounts → Manage Certificates →
`+` → Apple Development.

**`Timed out waiting for all destinations`** — Developer Mode is off on the
device. Settings → Privacy & Security → Developer Mode. The menu only appears
after a device build has been attempted.

**`its profile has not been explicitly trusted`** — on the device, Settings →
General → VPN & Device Management → trust the developer certificate.

Prefer **Release** for device testing: a Debug build needs Metro reachable over
Wi-Fi, and dev-mode Hermes is slow enough to make any measurement misleading.
The tradeoff is that Release strips `console.log` forwarding, so device logs
are empty — a harness must render results on screen or write them to a file.

## Running the tests

```bash
pnpm test           # Jest
pnpm typecheck      # tsc --noEmit
pnpm lint           # ESLint
pnpm format:check   # Prettier (code only)
```

Jest rather than the ecosystem's Vitest is deliberate — React Native ships
Flow types in its own source and resolves modules Metro-style, which Vitest
needs fragile workarounds to handle. Recorded in
[research 0002](docs/research/0002-react-native-framework-choice.md).

`jest.setup.js` makes `fetch` throw. The chat/inference layer is offline by
design, so a test reaching the network is a bug worth failing loudly on.
Connector tests must mock their transport explicitly.

### Green tests are not proof

For anything with a runtime surface, exercise it. Two bugs in this repo's
history passed a green suite: a stall watchdog that reported the wrong error
code because a promise race only occurs against a real download, and a build
step that exits 0 when the thing it was meant to do failed. Check artefacts,
not exit codes.

## Branching and commits

Always branch from an up-to-date `main`:

```bash
git switch main && git pull
git switch -c feat/your-feature-name
```

**Branch prefixes:**

| Prefix   | Use for                                         |
| -------- | ----------------------------------------------- |
| `feat/`  | New features or capabilities                    |
| `fix/`   | Bug fixes                                       |
| `docs/`  | Documentation only                              |
| `chore/` | Tooling, scaffolding, dependencies, maintenance |

**Commit messages** should explain _why_, not just _what_. Keep the subject
under 72 characters; wrap body lines at 100.

**Epic task IDs** (`<epic>.<seq>` — e.g. `0.4`, `2.1`) are stable and may be
cited in commit subjects and PR titles. **Roadmap slot versions** (e.g.
`0.1.4`) are volatile and must not be — they shift when work is reprioritised,
leaving stale references behind.

If an AI assistant helped write the code, include the co-author trailer:

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

## Pull requests

- **One logical change per PR.** Keep scope tight.
- All checks must pass before review: `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`.
- Cite the relevant research doc when a change implements or revisits a
  recorded decision.
- **Mark the task ✅ in both `ROADMAP.md` and the matching
  `docs/epics/<file>.md` heading, in the same PR.** Those are the only two
  places status is tracked.
- **Bump the version in the same PR**, to the roadmap slot the task just
  completed. Four files must agree — `package.json`, `app.json`,
  `src/shared/app-info.ts`, and the `Version:` header in `ROADMAP.md` — and
  `src/shared/app-info.test.ts` locks the first three together.

  Then run **`pnpm prebuild`**. `expo run:ios` and `run:android` do not
  re-run prebuild when the native directory exists, so the bump never reaches
  `Info.plist` or `build.gradle` on its own, and the shipped binary
  misreports itself. This has already gone wrong twice: once leaving the
  native version four releases stale, and once by regenerating only Android
  and leaving iOS behind. Check both:

  ```sh
  grep versionName android/app/build.gradle
  plutil -extract CFBundleShortVersionString raw ios/SovereignEdge/Info.plist
  ```
- PRs are merged with **rebase and merge** — no squash, no merge commits.
- **Fix commit messages before the PR is merged.** Correcting them afterwards
  means rewriting `main`.
- Agent-created PRs are opened as **drafts** (`gh pr create --draft`) and
  marked ready for review only on explicit instruction. **Never merge
  automatically.**

### Working directly on `main`

The branch-and-PR flow above is the default and the one to follow unless told
otherwise. In practice the developer sometimes asks for work to be committed
straight to `main` — early-stage, single-maintainer, no review to wait for.
That is a deliberate exception, not the process changing:

- It happens **only on explicit instruction**, per change. "Commit to main"
  for one task does not carry to the next.
- Everything else still applies. The checks still run, the version is still
  bumped, and `ROADMAP.md` plus the epic heading are still marked in the same
  commit.
- `ci.yml` runs on push to `main` precisely so this path is still gated.

Recorded because a reader comparing the git history against this document
would otherwise conclude one of them is wrong.
- PR bodies from Claude Code end with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

## Continuous integration

Two workflows, split so the slow native jobs do not gate every PR:

| Workflow                                          | Runs on                       | Does                                                      |
| ------------------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| [`ci.yml`](.github/workflows/ci.yml)             | every PR and push to `main`   | lint, format, typecheck, test                             |
| [`native.yml`](.github/workflows/native.yml)     | `main` and manual dispatch    | builds and launches on an iOS simulator + Android emulator |

**Three ways to skip `ci.yml`**, matching `sovereign`:

- keep the PR a **draft** — marking it _Ready for review_ runs the checks;
- add the **`skip-ci` label** to the PR;
- put **`[skip ci]`** (or `[ci skip]`, `[no ci]`) in the head commit message.

Unlike `sovereign`, this repo's `ci.yml` also runs on **push to `main`**.
`sovereign` validates `main` purely pre-merge, which assumes every change
arrives by PR. That assumption does not hold here yet — see the note on
direct-to-`main` work below — so the push trigger is the safety net.

The native workflow builds **Release**, not Debug — a Debug build loads its JS
from a Metro server and so proves nothing about launching standalone. Both
jobs assert the process is still alive ten seconds after launch, because both
platform launchers report success for a process that dies immediately.

Neither workflow downloads model weights.

**iOS jobs pin `macos-26`** rather than `macos-latest`, so an image rollover
cannot silently change the toolchain the boot gate runs on. `macos-15` is too
old — see the Swift 6.2 note above.

## Proposing a change (research docs)

This repo has no RFC stage yet. For an open-ended architectural or strategic
question with no concrete design, write a research doc in
[docs/research/](docs/research/): findings, options considered, and a
recommendation. It is kept after the decision lands — it is the record of
*why*, and "rejected" or "not now" are valid outcomes.

Write one **before** building on a guess. [Research 0003](docs/research/0003-model-verification-hashing.md)
exists because an on-device benchmark overturned a verification design that
looked obviously right on paper — SHA-256 measured 60× too slow to ship.

## Licence

By contributing you agree that your contributions are licensed under
[AGPL-3.0-or-later](LICENSE), matching the wider `sovereignfs` ecosystem.
