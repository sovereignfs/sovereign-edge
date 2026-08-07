# AGENTS.md — apps/desktop

Epic 9 (Desktop Shell, [docs/epics/desktop/shell.md](../../docs/epics/desktop/shell.md))
is resolved: **Tauri v2** — see
[research 0010](../../docs/research/0010-desktop-shell-technology.md) for the
full comparison against Electron and a React Native desktop renderer.
Workspace-wide rules live in the [root AGENTS.md](../../AGENTS.md).

## What this is

An empty Tauri window with a placeholder React DOM frontend. No product
features — no inference, no connectors, no chat UI — exist here yet; task
12.1 (scaffold and build tooling) is the only task of epic 12 (Desktop Core
Port) done so far. See
[docs/epics/desktop/core-port.md](../../docs/epics/desktop/core-port.md) for
the remaining tasks (12.2–12.7) and what each depends on.

## Before writing more code here

1. Task 12.2 (Rust `llama.cpp` `EngineAdapter` and model manager) is next,
   and depends only on 12.1. This is still "one task at a time, sequenced"
   per the root `AGENTS.md` — check `ROADMAP.md` for whether epic 12 or
   mobile's own remaining Phase 1 item (0.1.20) is actually scheduled next
   before starting.
2. `packages/desktop-ui` needs real content before task 12.7 (minimal chat
   UI) can use it — that's task 12.6, not yet done. `packages/mobile-ui`
   stays irrelevant here: Tauri renders a web frontend, not React Native
   primitives.

## State of play

- **Scaffold only** (task 12.1). `src-tauri/` is a real, building Rust
  crate; `src/App.tsx` renders a static placeholder, nothing interactive.
- **Verified on macOS only.** `cargo fmt --check`, `cargo clippy --all-targets
  -- -D warnings`, `pnpm tauri build --debug --no-bundle`, and a launch
  (`scripts/ci/launch-smoke.js`, confirming the process survives 5s) all ran
  clean locally on macOS. The Windows and Linux legs of `desktop.yml` are
  written against Tauri's own documented CI recipe but have not actually run
  on those platforms — no such machine was available when this task was
  done. Treat their first real run (the next push to `main`) as still
  unverified until it goes green.
- **Icons are real, not placeholders** — generated via `pnpm tauri icon`
  from `apps/mobile/assets/icon.png`, so the desktop and mobile apps share
  one visual identity rather than diverging from day one.

## Native project rules (Tauri's equivalent of mobile's native project)

- `src-tauri/` is checked-in source, not generated — unlike
  `apps/mobile/ios`/`android` (continuous native generation from `app.json`).
  Only `src-tauri/target/` (Cargo's build output) and `src-tauri/gen/`
  (Tauri's generated capability schemas) are gitignored.
- **Capabilities are default-deny** (research 0010's own security-model
  finding). `capabilities/default.json` grants only `core:default` — the
  bare minimum Tauri itself needs to create a window. Every command this app
  adds (Tier 3 native handlers, task 12.5; anything else) needs its own
  named permission referenced from a capability file — never broadened here
  as a shortcut.
- The Rust package name is `sovereign-edge-desktop` (binary) /
  `sovereign_edge_desktop_lib` (lib target, per Tauri's own mobile-entry-point
  convention) — distinct from the npm package name (`desktop`) and from
  mobile's bundle identifier (`fs.sovereign.edge`); this app's own identifier
  is `fs.sovereign.edge.desktop`.

## Verification

Nothing here yet has the kind of runtime surface mobile's own "two failures
invisible to a green test suite" history warns about — there is no chat, no
model, no connector code to hide a race or a silently-swallowed error. That
bar still applies going forward: once task 12.2 lands real inference, verify
it generates a real reply on-device, not just that `cargo check` passes.

## Layout

```
apps/desktop/
├── src/            # React DOM frontend — placeholder until task 12.7
├── src-tauri/       # Rust: Cargo.toml, lib.rs/main.rs, tauri.conf.json,
│                     # capabilities/, icons/
├── scripts/ci/      # launch-smoke.js — desktop.yml's own launch check
├── vite.config.ts
└── tsconfig.json
```

## Commands

Run from this directory, or from the repo root via `pnpm <command>` — the
root `package.json`'s `lint`/`typecheck`/`test` now run across every
workspace package that has the script (`pnpm -r --if-present`), covering
both apps from one invocation.

| Command                            | Does                                       |
| ------------------------------------ | --------------------------------------------- |
| `pnpm dev` (or `pnpm desktop` from root) | `tauri dev` — launches against the Vite dev server |
| `pnpm build`                       | `tauri build` — release bundle (unsigned)  |
| `pnpm typecheck`                   | `tsc --noEmit`                             |
| `pnpm lint`                        | ESLint                                     |
| `pnpm format:check`                | Prettier check — repo-wide, run from the root |
| `cargo fmt --check` (in `src-tauri/`) | Rust format check                       |
| `cargo clippy --all-targets -- -D warnings` (in `src-tauri/`) | Rust lint |

## Tech stack

Tauri v2 · Rust (stable toolchain, `rust-version = "1.77.2"` floor) · React
19 · Vite · TypeScript 6 · pnpm 11 · Node 24.

`@tauri-apps/api`/`@tauri-apps/cli` and `tauri`/`tauri-build` (Rust) are
pinned to current majors (`^2.x`) rather than exact versions, unlike
mobile's `react`/`react-native` — no React Native peer-dependency lock
reason applies here.
