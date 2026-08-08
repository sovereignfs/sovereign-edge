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

This repo is a pnpm workspace: `apps/mobile` is the shipping product below;
`apps/desktop` is a placeholder — shell technology decided (Tauri v2, see
[research 0010](docs/research/0010-desktop-shell-technology.md)), no code yet;
`packages/*` are internal, unpublished code shared between them.

See [CONCEPT.md](CONCEPT.md) for the full concept paper.

## Current status

**Early development — not a release.** No store build exists yet — not
because the build tooling is missing (task 0.3 is done: both platforms have
declarative signing and a local/CI release pipeline), but because App Store
Connect and Play Console listings (task 8.2) need a paid Apple Developer
Program membership and a Google Play Console account, neither of which
exists yet. That task is deliberately parked rather than blocking everything
else — see its epic for what's actually missing.

The offline core and the Search connector (Tier 1 — reaches the network,
with explicit per-connector permission) both work on real hardware. Phase 2
is starting: the connector layer's first **Tier 3** connectors — Calendar
and a small Device Utilities connector, both purely on-device, no network at
all — are next, ahead of the previously-planned Sovereign Tasks connector.
See [ROADMAP.md](ROADMAP.md) for the exact sequence.

| Area                                       | State                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| Offline chat (epic 1)                      | ✅ Complete — streaming replies, model manager, writing-assist modes         |
| Zero-network enforcement (1.5)             | ✅ Enforced in CI, not just intended — see [network audit](docs/network-audit.md) |
| Design system, app shell (7, 8.1)          | ✅ Theme tokens, core components, navigation, settings                       |
| Native build tooling (0.3)                 | ✅ Declarative signing (both platforms), local + CI release scripts          |
| Connector framework + Search connector (2, 3) | ✅ Complete — manifest, permissions, routing, runtime, in-chat provenance, Tier 1 shipped |
| Tier 3 connector scaffolding (2.6)         | 📋 Next up — required before Calendar/Device can be built                    |
| Calendar, Device connectors (10, 11)       | 📋 Planned — Phase 2, right after 2.6                                        |
| Sovereign Tasks connector (4)              | 📋 Planned — Phase 2, after Calendar/Device                                  |
| Store release (8.2)                        | 📋 Parked — needs a paid Apple Developer Program + Google Play Console account |

Measured on an iPhone 15 Pro (Release build, Metal active): Qwen2.5 0.5B
generates at 86–91 tok/s with a 233 ms cold time-to-first-token, and takes
8.7 s to load — the GPU upload that buys the generation speed.

[ROADMAP.md](ROADMAP.md) is the canonical task status. Anything else claiming
progress is a summary and may lag.

## How it works

Two trust tiers, both visible to the user:

1. **Chat** — fully local, fully offline, always. `llama.cpp`/GGUF via
   [`llama.rn`](https://github.com/mybigday/llama.rn). Nothing in this layer
   makes a network call.
2. **Connectors** — an explicit, permissioned layer. Each connector requests
   its own permission, separately revocable, and the UI shows which connector
   (if any) acted for a given reply — whether it reached the network (Tier 1)
   or an on-device OS capability like the calendar (Tier 3).

Connectors are tiered by how much trust they require — declarative manifests
(no code, open to any developer), sandboxed transform scripts, and first-party
native modules. [CONCEPT.md](CONCEPT.md#platform-architecture) explains why
that split exists and what mobile app stores actually allow.

## Development

Everything below is about `apps/mobile` — the only app that exists yet. See
[apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) for the full command list and
environment quirks; a desktop equivalent lands once epic 12 (the desktop
port — task 12.1's scaffold is done, the rest has not started) gets further
along.

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
pnpm install   # installs the whole workspace
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
cd apps/mobile
xcodebuild -workspace ios/SovereignEdge.xcworkspace -scheme SovereignEdge \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build
```

If an iOS build fails complaining about a missing workspace, check whether
`apps/mobile/ios/Pods` exists. `expo prebuild` can exit 0 with its internal
`pod install` having failed, and the `.xcworkspace` is created *by*
`pod install` — so the first visible symptom appears one step later than the
actual failure.

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
| `pnpm check:offline`| Walks imports from `src/chat/` for a socket path |
| `pnpm format`       | Prettier (code only — Markdown is left alone)   |

### Native projects are generated, not committed

`apps/mobile/ios/` and `apps/mobile/android/` are gitignored.
[`apps/mobile/app.json`](apps/mobile/app.json) plus Expo config plugins are
the source of truth, and `expo prebuild` regenerates the native projects from
them — so hand-edits inside `ios/` or `android/` are lost on the next
prebuild. Native configuration belongs in `app.json` or a config plugin.

Rationale, along with why this project excludes `expo-updates` and EAS Build,
is in [research 0002](docs/research/0002-react-native-framework-choice.md).

### Layout

```
sovereign-edge/
├── apps/
│   ├── mobile/          # the shipping product — see apps/mobile/AGENTS.md
│   │   ├── src/          # chat, models, connectors, design-system, settings
│   │   └── ...
│   └── desktop/          # Tauri v2 app, epic 12 done — see apps/desktop/AGENTS.md
├── packages/             # internal, unpublished, shared between the apps
│   ├── core/              # empty scaffold — connector manifest/permissions/
│   │   ...                # routing, eventually extracted from apps/mobile
│   ├── design-tokens/
│   ├── mobile-ui/
│   └── desktop-ui/
├── docs/
│   ├── epics/            # task breakdown per work stream, tagged by Scope
│   └── research/          # decision records
└── ...
```

See [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) for the full `src/`
breakdown — `chat/`, `models/`, `connectors/`, `design-system/`, `settings/`,
`shared/`, one directory per epic.

`models/` is a sibling of `chat/` rather than a child, and that is deliberate:
*acquiring* a model is a visible, user-initiated download, while *using* one
never touches the network. Keeping them separate is what lets the rule below
be enforced mechanically.

**Chat code must not import anything that opens a socket.** That is checked,
not just documented — in `apps/mobile`, `pnpm lint` restricts imports and
network globals inside `src/chat/`, and `pnpm check:offline` walks the import
graph to catch a transitive route lint cannot see. See
[docs/network-audit.md](docs/network-audit.md) for what each mechanism covers
and, more importantly, what it does not.

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
- [docs/network-audit.md](docs/network-audit.md) — how the offline claim is
  enforced, what each mechanism misses, and the commands to check it yourself
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, branching, commits, PRs, CI
- [docs/development-workflow.md](docs/development-workflow.md) — task lifecycle
  and how these documents fit together
- [docs/epics/](docs/epics/) — task detail per work stream, split into
  `mobile/`/`desktop/`/`shared/` by each epic's own `scope` frontmatter
- [docs/research/](docs/research/) — decision records and the reasoning behind them
- [AGENTS.md](AGENTS.md) — shared agent-facing conventions and hard
  architectural rules (`CLAUDE.md` points here)
- [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) /
  [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) — per-app commands,
  native build mechanics, environment quirks

## License

[AGPL-3.0-or-later](LICENSE), matching the wider `sovereignfs` ecosystem.
