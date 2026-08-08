---
epic: 12
title: Desktop Core Port
status: "⏳ In Progress — tasks 12.1–12.3 done"
scope: desktop
---

# Epic: Desktop Core Port

> Bring Phase 1/2 mobile functionality — inference engine, connector
> framework, a minimal chat UI — to desktop, on the shell decided in
> [Desktop Shell](shell.md).

## Overview

Secondary, optional desktop client. Sequenced after the mobile MVP proves
the concept, not built in parallel with it — per the developer's decision,
desktop as a whole is deliberately deferred. This epic holds that eventual
work; [Desktop Shell](shell.md) (epic 9) held only the technology decision
that unblocks it.

Not started. Unblocked in principle now that epic 9 is resolved (Tauri v2,
see [research 0010](../../research/0010-desktop-shell-technology.md)), but
whether this or mobile's own remaining Phase 1 item (task 0.1.20, store
release setup) is scheduled next is an open call — see `ROADMAP.md`, and this
repo's own "one task at a time, sequenced" convention in the root
`AGENTS.md`.

**Task breakdown below mirrors mobile's own granularity** (Core Inference &
Chat: 6 tasks; Connector Framework: 6 tasks) rather than the single
monolithic task this epic started with — sized so each is independently
implementable and reviewable, per the root `AGENTS.md`'s "implement a single
task, verify its review checklist, then stop for human review." Each task
below is grounded in something research 0010 already decided (the
`EngineAdapter`, `SecureStorageAdapter`, and Tier 3 native-handler-registry
shapes it names explicitly); none of this breakdown invents a new
architectural decision that doc didn't already make.

**Deliberately out of scope for this epic:** a full desktop app shell —
navigation, settings screens, per-connector permission UI — the desktop
equivalent of [Mobile App Shell](../mobile/mobile-app-shell.md) (epic 8).
Task 12.7 below includes only the minimal chat surface needed to verify
12.2–12.6 end to end, the same role mobile's own task 1.3 (offline chat UI)
plays inside Core Inference & Chat rather than inside its own App Shell
epic. A real desktop app shell is future, unscoped work — its own epic once
there's a reason to build it, not invented speculatively here.

## Tasks

#### ✅ 12.1 — Tauri app scaffold and build tooling

**Goal:** Stand up the Tauri project this whole app is built on, the
desktop equivalent of mobile's own task 0.1 (repo scaffold) and 0.3 (native
build tooling) combined into one task rather than a separate infrastructure
epic — desktop doesn't yet have enough surface to justify its own epic 0.

**Deliverables:**

- `apps/desktop`'s `src-tauri/` Rust project plus its React DOM frontend
  scaffold, wired into the existing pnpm workspace.
- A capabilities/permissions skeleton (empty allow-list to start — Tauri v2's
  default-deny posture per research 0010), not a populated one; populated by
  tasks 12.3 and 12.5 as they add real commands.
- Dev and build tooling for macOS, Windows, and Linux; a CI smoke build for
  at least macOS (matching whatever the mobile CI's own platform-coverage
  precedent is).
- Shared TS/ESLint/Prettier config extended to cover `apps/desktop`, plus a
  `rustfmt`/`clippy` baseline for the new Rust surface — this repo's first.

**Dependencies:** Epic 9 (Desktop Shell) decision.

**Review checklist:**

- A fresh clone can build and launch an empty Tauri window on macOS, Windows,
  and Linux following only this task's own setup docs.
- CI fails loudly on a Rust compile error or lint failure, the same
  "must fail loudly, not silently pass" bar the root `AGENTS.md` sets for the
  zero-network CI check.

`apps/desktop/src-tauri/` (Rust, Cargo.toml/build.rs/lib.rs/main.rs) plus a
Vite + React DOM frontend (`index.html`, `vite.config.ts`, `src/App.tsx`),
identifier `fs.sovereign.edge.desktop`, icons generated from
`apps/mobile/assets/icon.png` via `tauri icon` for brand consistency rather
than a placeholder. `capabilities/default.json` grants only `core:default` —
nothing app-specific yet, per this task's own "empty allow-list" deliverable.
Root `package.json`'s `lint`/`typecheck`/`test` scripts changed from
`pnpm --filter mobile ...` to `pnpm -r --if-present ...` so `ci.yml` covers
both apps without its own changes; `apps/mobile`'s own scripts (`ios`,
`android`, `check:offline`) are untouched.

**Verified on macOS, not on Windows or Linux — flagged rather than assumed.**
`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
`pnpm tauri build --debug --no-bundle`, and the launch-smoke script
(`scripts/ci/launch-smoke.js` — spawns the built binary, fails if it exits
within 5s, mirroring native.yml's own "still running N seconds later" bar
for mobile) all ran clean locally on macOS during this task. `desktop.yml`'s
Windows and Linux jobs were written against Tauri's own documented CI recipe
(the exact `apt` package list — `libwebkit2gtk-4.1-dev`,
`libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, plus `xvfb-run`
to give the Linux runner a display to launch into) but have not actually run
on those platforms yet — no Windows or Linux machine was available to this
task. First real signal on those two legs is whichever push to `main` first
triggers `desktop.yml`; treat a Windows/Linux failure there as this task's
own gap, not a regression in unrelated work.

---

#### ✅ 12.2 — Rust `llama.cpp` `EngineAdapter` and model manager

**Goal:** On-device GGUF inference on desktop, mirroring mobile's task 1.1
(`llama.rn` integration) and 1.2 (model manager).

**Deliverables:**

- An `EngineAdapter` around a Rust `llama.cpp` binding (final crate choice —
  `llama-cpp-2`, `llama_cpp-rs`, or a bundled `llama-server` — is this task's
  to make; research 0010 deliberately left it open).
- A desktop model manager: download, verify, and select a GGUF model,
  reusing `packages/core`'s model-descriptor shape once that extraction
  happens, or mirroring `apps/mobile/src/models/` closely if it hasn't yet.

**Dependencies:** Task 12.1.

**Review checklist:**

- A real GGUF model loads and generates a reply on-device on at least macOS —
  this repo's own verification convention (exercise the behavior, not just
  the exit code) applies here exactly as it did for `llama.rn` on mobile.
- No network call happens on the inference path itself — only the explicit,
  user-initiated model download does, per the root `AGENTS.md`'s hard
  architectural rule 1 and its rule-3 exception.

**Decided: `llama-cpp-2`** (the `utilityai/llama-cpp-rs` project), Metal
enabled on macOS only via a target-gated Cargo dependency — CPU-only
elsewhere for now, matching mobile's Metal-on-iOS split. Rejected
`llama_cpp-rs` (thinner, less active) and a bundled `llama-server` subprocess
(an IPC layer with no benefit here; in-process bindings keep this port
structurally parallel to how `llama.rn` is used on mobile).

`apps/desktop/src-tauri/src/engine/` (`types.rs`, `adapter.rs`) mirrors
`apps/mobile/src/chat/inference/`'s `InferenceEngine` invariants (one
context at a time, streaming per-token callback, cancellation, chat-template
prompting) using `llama-cpp-2`'s `LlamaBackend`/`LlamaModel`/`LlamaContext`,
with `self_cell` to hold the model and its borrowed context together safely.
`apps/desktop/src-tauri/src/models/` (`types.rs`, `catalog.rs`, `store.rs`,
`hashing.rs`, `verify.rs`, `download.rs`, `device.rs`, `manager.rs`) mirrors
`apps/mobile/src/models/` closely, per this epic's own instruction, since
`packages/core`'s extraction still hasn't happened. `lib.rs` registers the
minimal Tauri command set (`list_models`, `install_model`, `load_model`,
`generate` with streaming events, `cancel_generation`, `unload_model`,
`engine_info`, etc.) plus a best-effort startup bootstrap that loads the
last-used model, mirroring mobile's `ModelSessionProvider`.

**Two deliberate deviations from mobile, both documented in-code:**
`llama-cpp-2`'s `LlamaModelLoadError` carries no message text at all, so
mobile's regex-on-error-message technique for distinguishing "out of memory"
from "the file is broken" isn't portable as-is; `engine/adapter.rs` instead
does a preflight RAM-budget check reusing `models::device`'s own fit
formula. Separately, `capabilities/default.json` now notes that Tauri v2's
ACL only gates *plugin*-provided commands by default — this task's own
app-registered commands are reachable without a capability entry unless the
app opts into gating them via `build.rs`, which isn't wired up yet; flagged
there as a gap for task 12.5 (Tier 3 native handlers) to close, not silently
assumed.

**Verified on macOS, not on Windows or Linux — flagged rather than assumed,**
the same gap 12.1 recorded. `cargo fmt --check` and
`cargo clippy --all-targets -- -D warnings` ran clean.
`apps/desktop/src-tauri/tests/engine_smoke.rs` (`#[ignore]`d — it downloads
a real ~490MB model) downloaded, verified, and loaded the catalog's smallest
model (Qwen2.5 0.5B) through the real `EngineAdapter` and generated an
actual reply on-device with Metal GPU offload active:
`loaded: gpu=true reason_no_gpu=None context_size=2048` /
`reply (Eos, 2 tokens, Some(31)ms to first token): "Hello!"`. A grep of
`src/engine/` confirms zero network-crate references in the inference path.

---

#### ✅ 12.3 — `SecureStorageAdapter` over the OS credential store

**Goal:** Per-connector credential isolation on desktop, mirroring what
`apps/mobile/src/connectors/permissions/vault.ts` already guarantees on
mobile.

**Deliverables:**

- A `SecureStorageAdapter` Tauri plugin over macOS Keychain, Windows
  Credential Manager, and Linux Secret Service.
- The same "cannot, not should not" isolation property `vault.ts` documents:
  no exported function takes a connector ID and a key directly: only a
  handle scoped to one connector's own namespace.

**Dependencies:** Task 12.1.

**Review checklist:**

- A credential written for one connector is unreachable through another
  connector's handle — the same test `permissions/grants.test.ts` already
  runs for mobile, ported rather than redesigned.
- Revoking a connector destroys its stored credential, matching
  `permissions/grants.ts`'s `revoke()` behavior exactly.

**Decided: `keyring` v3.6.3** (not the newer v4 `keyring-core` redesign —
v3's `Entry::new`/`set_password`/`get_password`/`delete_credential` API is
the long-stable one, and its MSRV, 1.75, is already below this crate's own
floor). Target-gated Cargo features per OS, mirroring 12.2's `llama-cpp-2`
split: `apple-native` (macOS), `windows-native` (Windows),
`sync-secret-service` (Linux) — the same three backends research 0010 named.

**Not a separate Tauri plugin crate**, despite `core-port.md`'s own "Tauri
plugin" phrasing above: mobile's `openVault` is never called from UI code
either — its only caller is `connectors/runtime/execute.ts`, internal
Rust-side business logic (task 12.4's connector runtime), never IPC from the
WebView. A plain Rust module (`apps/desktop/src-tauri/src/secure_storage/`)
needs no command/capability surface, so the formal plugin machinery would be
unused ceremony. Documented as a deliberate scope call in-code, the same way
12.2 flagged its own deviations.

`secure_storage/vault.rs` ports `vault.ts`'s `ConnectorVault`/`openVault`
directly: same `SAFE_SEGMENT`-equivalent charset check, same
single-namespace-plus-composite-key isolation shape (`keyring` "service" =
a fixed `sovereign.connector` constant, "username" =
`<connectorId>.<credentialKey>`), same `Ok(None)`-on-missing /
no-throw-on-missing-key-delete semantics as `SecureStore`. **Note:**
`grants.ts`'s own port — the grant/consent state machine whose `revoke()`
calls this vault's `clear()` — is task 12.4's deliverable, not this one;
12.3 delivers the vault primitive only, per `core-port.md`'s own task-4
deliverable list ("reused as-is, backed by task 12.3's
`SecureStorageAdapter`").

**Verified on macOS, not on Windows or Linux — flagged rather than
assumed,** the same gap 12.1 and 12.2 recorded. `cargo fmt --check` and
`cargo clippy --all-targets -- -D warnings` ran clean. Two test tiers, both
run and both green: `cargo test --lib secure_storage` (7 tests, mock-backed
via `keyring::mock` — fast, no real OS access) and
`apps/desktop/src-tauri/tests/vault_smoke.rs` (`#[ignore]`d — writes real
entries into this machine's actual macOS Keychain, verifies isolation
between two connectors sharing one credential key, verifies `clear()`
destroys the credential, then deletes its own scratch entries regardless of
pass/fail): `test isolates_and_destroys_credentials_in_the_real_keychain
... ok`.

---

#### 📋 12.4 — Connector framework port (Tier 1)

**Goal:** The manifest schema, permission model, and Tier 1 (HTTP) runtime
dispatch work on desktop unchanged — this epic's own review checklist from
before the breakdown.

**Deliverables:**

- `executeConnectorCall`'s `case 1` (HTTP request/response templating) built
  against desktop's own `fetch`, with the manifest schema and cross-field
  validation (`manifest/schema.ts`, `manifest/validate.ts`) reused as-is —
  no desktop-specific fork.
- The grant/consent state machine and generalized granted-scope concept
  (`permissions/grants.ts`, task 2.6) reused as-is, backed by task 12.3's
  `SecureStorageAdapter` instead of `expo-secure-store`.

**Dependencies:** Tasks 12.2, 12.3.

**Review checklist:**

- The Search connector's existing manifest (`apps/mobile/src/connectors/search/manifest.ts`)
  executes a real request/response round trip on desktop with zero changes
  to the manifest itself — this epic's original, defining review bar.

---

#### 📋 12.5 — Tier 3 native handler registry (Tauri)

**Goal:** The Tier 3 extension point (task 2.6) ported to Tauri commands,
mirroring `apps/mobile/src/connectors/runtime/nativeHandlers.ts`.

**Deliverables:**

- `executeConnectorCall`'s `case 3` dispatching to Tauri commands, each
  gated by Tauri v2's own capabilities system rather than `isAllowed()`
  alone — belt-and-braces, matching research 0010's finding that this is the
  closer structural fit than Electron would have offered.
- At least one real registered capability, the same proof-of-life role
  `device.info`/`expo-device` played for task 2.6 on mobile — a genuinely
  cross-platform one (e.g. OS version/hostname) rather than inventing a
  desktop-specific connector ahead of need.

**Dependencies:** Tasks 12.1, 12.4.

**Review checklist:**

- Revoking a Tier 3 connector's grant blocks its Tauri command from running,
  verified on-device (not just Jest-equivalent mocks) — the same bar task
  2.6 set and met on the iOS Simulator.

---

#### 📋 12.6 — `packages/desktop-ui` initial component set

**Goal:** The component set task 12.7's chat UI (and any future desktop
screen) is built from, matching `apps/mobile/src/design-system`'s shape for
React DOM.

**Deliverables:**

- `ThemeProvider`, `Button`, `ChatBubble`, `ListItem`, `TextField`, `Toggle`
  built against `packages/design-tokens`, per that package's own README.

**Dependencies:** Task 12.1.

**Review checklist:**

- Each component renders correctly in at least two of the three WebView
  engines this app ships on (WebKit/macOS, WebView2/Windows) — the rendering
  parity research 0010 flagged as unmeasured, checked here rather than left
  open indefinitely.

---

#### 📋 12.7 — Minimal offline chat UI

**Goal:** Enough UI to exercise tasks 12.2–12.5 end to end and verify them
the way this repo's own convention requires — a real behavior check, not a
green test suite — mirroring the role mobile's task 1.3 played inside its
own Core Inference & Chat epic rather than inside App Shell.

**Deliverables:**

- A single chat screen: model selection, message input/output, and the same
  in-chat connector-provenance marker mobile's task 2.5 established
  (`connector?: string` on the reply).

**Dependencies:** Tasks 12.2, 12.4, 12.6.

**Review checklist:**

- A fully offline conversation works end to end on-device with no connector
  installed, and a granted Tier 1 connector answers and is visibly marked as
  having done so — the desktop equivalent of task 2.5's own review bar.

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0001](../../research/0001-concept-and-connector-architecture.md)
- [Desktop Shell](shell.md) — epic 9, the shell-technology decision this
  depends on
- [research 0010](../../research/0010-desktop-shell-technology.md)
- [Core Inference & Chat](../mobile/core-inference-chat.md) (epic 1) and
  [Connector Framework](../mobile/connector-framework.md) (epic 2) — the
  mobile epics this one ports
