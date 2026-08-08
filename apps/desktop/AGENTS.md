# AGENTS.md — apps/desktop

Epic 9 (Desktop Shell, [docs/epics/desktop/shell.md](../../docs/epics/desktop/shell.md))
is resolved: **Tauri v2** — see
[research 0010](../../docs/research/0010-desktop-shell-technology.md) for the
full comparison against Electron and a React Native desktop renderer.
Workspace-wide rules live in the [root AGENTS.md](../../AGENTS.md).

## What this is

A Tauri window with real on-device inference (task 12.2), per-connector
credential storage (task 12.3), a working Tier 1 (HTTP) connector runtime
(task 12.4), and a Tier 3 native handler registry (task 12.5, `device_info`)
behind it, but still a placeholder React DOM frontend — no chat UI, nothing
wired to a model or a connector from the UI yet. Tasks 12.1–12.5 are done;
see [docs/epics/desktop/core-port.md](../../docs/epics/desktop/core-port.md)
for the remaining tasks (12.6–12.7) and what each depends on.

## Before writing more code here

1. Task 12.6 (`packages/desktop-ui` initial component set) is next, and
   depends on 12.1 (done). This is still "one task at a time, sequenced"
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
- **Tauri's ACL now gates every app command (12.5).** `build.rs` calls
  `tauri_build::try_build` with `Attributes::new().app_manifest(AppManifest::new()
  .commands(&[...]))` listing every registered command; `capabilities/default.json`
  grants each one an individual `allow-<command>` permission (kebab-case —
  `install_model` → `allow-install-model` — confirmed by an actual build
  failure before this was written correctly, not assumed). Keep both lists
  in sync with `tauri::generate_handler!`'s own list in `lib.rs` when adding
  a command; a mismatch either leaves a command unrestricted (missing from
  `build.rs`) or fails the build outright (listed but ungranted).
- **Per-connector credential isolation (12.3).**
  `src-tauri/src/secure_storage/vault.rs` mirrors
  `apps/mobile/src/connectors/permissions/vault.ts`'s `ConnectorVault`: the
  only way to reach a stored credential is a handle scoped to one
  connector's namespace, backed by `keyring` v3 over macOS Keychain/Windows
  Credential Manager/Linux Secret Service (target-gated feature per OS —
  see `Cargo.toml`). Deliberately **not** a Tauri plugin crate — nothing in
  the frontend calls this on mobile either, only internal connector-runtime
  code (task 12.4's job) will. `grants.ts`'s own port (the state machine
  whose `revoke()` calls this vault's `clear()`) is task 12.4's deliverable,
  not 12.3's — this module is the primitive only.
  `cargo test --lib secure_storage` (mock-backed, fast) and
  `src-tauri/tests/vault_smoke.rs` (`#[ignore]`d, real Keychain) both pass;
  the real-keychain run confirmed isolation between two connectors sharing
  one credential key and that `clear()` actually destroys a credential.
- **Connector framework, Tier 1 (12.4).** `src-tauri/src/connectors/`
  mirrors `apps/mobile/src/connectors/`'s `manifest/`/`permissions/`/
  `runtime/` split. `manifest/fixtures.rs` embeds the literal mobile
  `search.manifest.json` via `include_str!` (not a copy), so its own tests
  (and any future one) can assert against the exact fixture with no risk of
  drift. `permissions/grants.rs` is the grant/consent state machine,
  calling 12.3's `secure_storage::open_vault` on revoke; `runtime/execute.rs`
  is Tier 1 HTTP dispatch, split into pure `build_request`/`map_response`
  functions plus an async `dispatch` (unlike mobile's single
  `fetch`-mocked function) specifically so request construction from the
  real fixture is directly assertable with no server involved.
  `cargo test --lib` (41 tests, mock-backed) and
  `src-tauri/tests/connector_dispatch.rs` (**not** `#[ignore]`d — a real
  local TCP server, no external network needed) both pass; the latter
  proved a real request/response round trip end to end, since
  `search.manifest.json`'s own origin is RFC 2606's non-resolving example
  domain and can't be dialed for real without rewriting the fixture under
  test.
- **Tier 3 native handler registry (12.5).** `connectors/runtime/
  native_handlers.rs` mirrors `nativeHandlers.ts`'s capability→handler map;
  `device.info` reads hostname/OS name/version via `sysinfo` (mobile's own
  `modelName`/`osName`/`osVersion` has no desktop equivalent). Tier 3
  dispatch in `execute_connector_call` (stubbed in 12.4, implemented here)
  mirrors `executeTier3` exactly. One new command, `device_info`, wraps
  `execute_connector_call` directly — no separate gating logic to drift
  from the internal path. `cargo test --lib` (45 tests) includes real,
  unmocked Tier 3 coverage, including
  `revoking_a_tier3_grant_blocks_the_native_handler` — granted → succeeds,
  `revoke()`'d → blocked, matching the review checklist's own wording.
  Real debug binary built and launched (`scripts/ci/launch-smoke.js`) after
  wiring the new ACL mechanism. **Gap flagged, not faked:** this
  environment has no way to drive a native window's devtools, so the
  literal "invoke from the WebView console" step wasn't performed by hand —
  the unmocked Rust test plus the real build/launch check exercise the same
  code path instead.
- **Icons are real, not placeholders** — generated via `pnpm tauri icon`
  from `apps/mobile/assets/icon.png`, so the desktop and mobile apps share
  one visual identity rather than diverging from day one.

## Native project rules (Tauri's equivalent of mobile's native project)

- `src-tauri/` is checked-in source, not generated — unlike
  `apps/mobile/ios`/`android` (continuous native generation from `app.json`).
  Only `src-tauri/target/` (Cargo's build output) and `src-tauri/gen/`
  (Tauri's generated capability schemas) are gitignored.
- **Capabilities are default-deny** (research 0010's own security-model
  finding), and — since task 12.5 — actually enforced for this app's own
  commands, not just plugin ones. `capabilities/default.json` grants
  `core:default` plus one `allow-<command>` permission per command this app
  registers; every new command needs both a `build.rs` `COMMANDS` entry and
  a capability permission — never broadened to a wildcard as a shortcut.
- The Rust package name is `sovereign-edge-desktop` (binary) /
  `sovereign_edge_desktop_lib` (lib target, per Tauri's own mobile-entry-point
  convention) — distinct from the npm package name (`desktop`) and from
  mobile's bundle identifier (`fs.sovereign.edge`); this app's own identifier
  is `fs.sovereign.edge.desktop`.

## Verification

Mobile's own "two failures invisible to a green test suite" history is why
task 12.2's own review bar was a real on-device reply
(`tests/engine_smoke.rs`, `#[ignore]`d, run manually) and task 12.3's was a
real Keychain round trip (`tests/vault_smoke.rs`, same pattern) — not just
`cargo check`/`cargo clippy` passing, and not just a mock-backed unit test
(`secure_storage/vault.rs`'s own tests exist for speed, but the `#[ignore]`d
real-backend test is what actually closed the task). That bar applies to
every future task here too.

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
