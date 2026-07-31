# Sovereign Edge

[![CI](https://github.com/sovereignfs/sovereign-edge/actions/workflows/ci.yml/badge.svg)](https://github.com/sovereignfs/sovereign-edge/actions/workflows/ci.yml)
[![Native build](https://github.com/sovereignfs/sovereign-edge/actions/workflows/native.yml/badge.svg)](https://github.com/sovereignfs/sovereign-edge/actions/workflows/native.yml)

_"Sovereign Edge" is a working codename tied to this repo's directory name —
not a decided consumer-facing product name._

A privacy-first, fully offline AI companion for phones. You download a small
language model (Gemma, Qwen, Phi, or similar) straight to your own device and
talk to it with **zero network requests from the chat itself** — not as a
promise, but because the chat and inference path contains no network code.

On top of that offline core sits an optional, explicitly-permissioned
**connector layer**: a small set of agents that can reach outside the device —
to search the web, or create a task in your own self-hosted software — but only
once you have granted that specific connector that specific permission.

Fully standalone. No runtime dependency on [`sovereign`](https://github.com/sovereignfs/sovereign),
and it works with zero knowledge that `sovereign` exists.

See [CONCEPT.md](CONCEPT.md) for the full concept paper.

## Current status

**Early development — not usable yet, and not a release.**

Phase 1 is underway. What exists today is the foundation, not the product:

| Area                       | State                                                      |
| -------------------------- | ---------------------------------------------------------- |
| Repo scaffold (0.1.1)      | ✅ Expo SDK 57, RN 0.86, TypeScript, iOS + Android          |
| CI pipeline (0.1.2)        | ✅ lint/format/typecheck/test, plus a native boot gate      |
| On-device inference        | 📋 not started — the app currently renders a placeholder    |
| Chat UI, connectors, store | 📋 not started                                              |

The app builds and launches on both an iOS simulator and an Android emulator,
verified on every push to `main`. It does not yet do anything.

Track progress in [ROADMAP.md](ROADMAP.md).

## How it works

Two trust tiers, both visible to the user:

1. **Chat** — fully local, fully offline, always. `llama.cpp`/GGUF via
   [`llama.rn`](https://github.com/mybigday/llama.rn). Nothing in this layer
   makes a network call.
2. **Connectors** — an explicit, permissioned layer. Each connector requests
   its own permission, separately revocable, and the UI shows which connector
   (if any) touched the network for a given reply.

Connectors are tiered by how much trust they require — declarative manifests
(no code, open to any developer), sandboxed transform scripts, and first-party
native modules. [CONCEPT.md](CONCEPT.md#platform-architecture) explains why
that split exists and what mobile app stores actually allow.

## Development

### Requirements

- Node 24.x (see [.node-version](.node-version)) and `pnpm` 11
- **iOS:** macOS with Xcode 26+ and CocoaPods. Xcode 26 is a hard floor —
  Expo SDK 57 pulls a Swift package requiring Swift tools 6.2, and older
  Xcode fails at package resolution with an error naming neither.
- **Android:** JDK 17 and the Android SDK (API 34+)
- **A UTF-8 locale.** CocoaPods calls `String#unicode_normalize` on the
  install path, which throws `Encoding::CompatibilityError` when `LANG` is
  unset and Ruby falls back to ASCII-8BIT. The traceback points at
  `verify_podfile_exists!`, so it reads as a missing Podfile rather than a
  locale problem. If `locale` shows `LC_CTYPE="C"`, add to your shell
  profile:

  ```sh
  export LANG=en_US.UTF-8   # or C.UTF-8
  ```

  CI runners set this already, so it only bites locally.

### Setup

```sh
git clone https://github.com/sovereignfs/sovereign-edge.git
cd sovereign-edge
pnpm install
```

```sh
pnpm ios       # build and run on an iOS simulator
pnpm android   # build and run on an Android emulator
```

Both commands run `expo prebuild` first if needed, then compile natively.
The first run takes a while; later runs are incremental.

> **Expo Go does not work here, by design.** `llama.rn` is a native module, so
> a development build is the only supported workflow. `pnpm start` assumes a
> dev client is already installed.

Prefer `pnpm ios` over driving `xcodebuild` by hand. A bare
`xcodebuild -sdk iphonesimulator` with no `-destination` leaves
`ONLY_ACTIVE_ARCH` unable to resolve an active architecture, so it builds
every standard arch including x86_64 — which fails on Apple Silicon, because
Expo's prebuilt XCFrameworks ship no x86_64 simulator slice. If you do invoke
it directly, pass a concrete destination:

```sh
xcodebuild -workspace ios/SovereignEdge.xcworkspace -scheme SovereignEdge \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build
```

If an iOS build fails complaining about a missing workspace, check whether
`ios/Pods` exists. `expo prebuild` can exit 0 with its internal `pod install`
having failed, and the `.xcworkspace` is created *by* `pod install` — so the
first visible symptom appears one step later than the actual failure.

### Scripts

| Command             | Does                                            |
| ------------------- | ----------------------------------------------- |
| `pnpm start`        | Metro bundler for an installed dev build        |
| `pnpm ios`          | Build and launch on an iOS simulator            |
| `pnpm android`      | Build and launch on an Android emulator         |
| `pnpm prebuild`     | Regenerate `ios/` and `android/` from scratch   |
| `pnpm test`         | Jest                                            |
| `pnpm typecheck`    | `tsc --noEmit`                                  |
| `pnpm lint`         | ESLint                                          |
| `pnpm format`       | Prettier (code only — Markdown is left alone)   |

### Native projects are generated, not committed

`ios/` and `android/` are gitignored. [`app.json`](app.json) plus Expo config
plugins are the source of truth, and `expo prebuild` regenerates the native
projects from them — so hand-edits inside `ios/` or `android/` are lost on the
next prebuild. Native configuration belongs in `app.json` or a config plugin.

Rationale, along with why this project excludes `expo-updates` and EAS Build,
is in [research 0002](docs/research/0002-react-native-framework-choice.md).

### Layout

```
sovereign-edge/
├── src/
│   ├── chat/           # inference engine, model manager, chat UI  (epic 1)
│   ├── connectors/     # manifest schema, permissions, routing     (epic 2)
│   ├── design-system/  # theme tokens, core components             (epic 7)
│   ├── settings/       # navigation, settings, app shell           (epic 8)
│   └── shared/         # cross-module utilities
├── docs/
│   ├── epics/          # task breakdown per work stream
│   └── research/       # decision records
└── scripts/ci/         # CI helper scripts
```

One directory per epic, so code structure and planning structure stay
aligned — see [src/README.md](src/README.md), which also documents the one
structural rule: **`chat/` must not import anything that opens a socket.**

## CI

Two workflows, split so the slow native jobs don't gate every PR:

- **CI** — lint, format, typecheck, and test on every PR. Nothing here
  downloads model weights; `jest.setup.js` makes `fetch` throw, so an
  accidental network call fails the run.
- **Native build** — on `main` and manual dispatch. Builds Release for both
  platforms, installs, launches, and asserts the process is still alive ten
  seconds later. Release rather than Debug because a Debug build loads its JS
  from a Metro server and so proves nothing about launching standalone.

## Documentation

- [CONCEPT.md](CONCEPT.md) — concept paper: vision, architecture, phasing
- [ROADMAP.md](ROADMAP.md) — chronological task index and canonical task status
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, branching, commits, PRs, CI
- [docs/development-workflow.md](docs/development-workflow.md) — task lifecycle
  and how these documents fit together
- [docs/epics/](docs/epics/) — task detail per work stream
- [docs/research/](docs/research/) — decision records and the reasoning behind them
- [AGENTS.md](AGENTS.md) — agent-facing conventions and hard architectural
  rules (`CLAUDE.md` points here)

## License

[AGPL-3.0-or-later](LICENSE), matching the wider `sovereignfs` ecosystem.
