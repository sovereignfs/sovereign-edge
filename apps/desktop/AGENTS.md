# AGENTS.md — apps/desktop

Epic 9 (Desktop Shell, [docs/epics/desktop/shell.md](../../docs/epics/desktop/shell.md))
is resolved: **Tauri v2** — see
[research 0010](../../docs/research/0010-desktop-shell-technology.md) for the
full comparison against Electron and a React Native desktop renderer.
Workspace-wide rules live in the [root AGENTS.md](../../AGENTS.md).

## What this is

A Tauri window with real on-device inference behind it (task 12.2) but still
a placeholder React DOM frontend — no chat UI, no connectors yet. Tasks 12.1
(scaffold) and 12.2 (`EngineAdapter` + model manager) are done; see
[docs/epics/desktop/core-port.md](../../docs/epics/desktop/core-port.md) for
the remaining tasks (12.3–12.7) and what each depends on.

## Before writing more code here

1. Task 12.3 (`SecureStorageAdapter` over the OS credential store) is next,
   and depends only on 12.1. This is still "one task at a time, sequenced"
   per the root `AGENTS.md` — check `ROADMAP.md` for whether epic 12 or
   mobile's own remaining Phase 1 item (0.1.20) is actually scheduled next
   before starting.
2. `packages/desktop-ui` needs real content before task 12.7 (minimal chat
   UI) can use it — that's task 12.6, not yet done. `packages/mobile-ui`
   stays irrelevant here: Tauri renders a web frontend, not React Native
   primitives.

## State of play

- **Scaffold (12.1) + on-device inference (12.2).** `src-tauri/src/engine/`
  and `src-tauri/src/models/` mirror `apps/mobile/src/chat/inference/` and
  `apps/mobile/src/models/` closely (`packages/core` still hasn't been
  extracted). `lib.rs` registers Tauri commands
  (`list_models`/`install_model`/`load_model`/`generate`/etc.) over them,
  plus a best-effort startup bootstrap that loads the last-used model. No
  frontend consumes these yet — `src/App.tsx` still renders a static
  placeholder; that's task 12.7's job.
- **Verified on macOS only.** `cargo fmt --check` and
  `cargo clippy --all-targets -- -D warnings` are clean.
  `src-tauri/tests/engine_smoke.rs` (`#[ignore]`d — downloads a real ~490MB
  model) downloaded, verified, loaded, and generated an actual on-device
  reply through Metal GPU offload: `reply (Eos, 2 tokens, Some(31)ms to
  first token): "Hello!"`. Windows/Linux compile is still unverified — no
  such machine was available, the same gap 12.1 recorded.
- `llama-cpp-2`'s load-failure type carries no error message text, so
  mobile's regex-based OOM/bad-file classification isn't portable as-is;
  `engine/adapter.rs` substitutes a preflight RAM-budget check instead —
  see that file's own doc comment before changing load-error handling.
- **Tauri's ACL does not yet gate this app's own commands** — v2 only
  capability-gates plugin-provided commands by default, and the `build.rs`
  opt-in to gate app commands too isn't wired up. Flagged in
  `capabilities/default.json`; closing this is task 12.5's job, not
  something to bolt on ad hoc later.
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

Mobile's own "two failures invisible to a green test suite" history is why
task 12.2's own review bar was a real on-device reply
(`tests/engine_smoke.rs`, `#[ignore]`d, run manually), not just
`cargo check`/`cargo clippy` passing. That bar applies to every future task
here too — 12.3's credential isolation should be verified by actually
writing/reading/revoking a credential, not just by a passing unit test
against a mock.

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
