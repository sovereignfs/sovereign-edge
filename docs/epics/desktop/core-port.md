---
epic: 12
title: Desktop Core Port
status: "✅ Done — tasks 12.1–12.7, 12.7a, 12.8, 12.9 all done"
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

#### ✅ 12.4 — Connector framework port (Tier 1)

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

`apps/desktop/src-tauri/src/connectors/` (new, `pub mod`, mirroring
`apps/mobile/src/connectors/`'s own directory split): `manifest/` (serde
structs with `#[serde(deny_unknown_fields)]` mirroring Zod's `.strict()`;
`ValueSource`/`PathPart` as `#[serde(untagged)]` enums; `ConnectorManifest`
parsed by peeking `tier` rather than serde's own tagging, since Zod's
`discriminatedUnion('tier', ...)` uses a numeric field serde's internal
tagging can't match directly), `permissions/grants.rs` (the state machine,
taking `grants_dir: &Path` explicitly rather than mobile's implicit global
path — mirrors `models::store`'s own pattern — and calling task 12.3's
`secure_storage::open_vault` on `revoke()`, exactly like mobile calls
`openVault` internally), `runtime/execute.rs` (split into pure
`build_request`/`map_response` functions plus an async `dispatch`, unlike
mobile's single `fetch`-mocked function — this is what let the real
`search.manifest.json` fixture's request construction be asserted
byte-for-byte with no server involved). `manifest/fixtures.rs` embeds the
literal mobile fixture via `include_str!`, not a copy, so "zero changes to
the manifest itself" is a build-time guarantee rather than a promise to
keep two files in sync by hand. No new Tauri commands and no new Cargo
dependencies — same call 12.3 made (nothing on mobile calls this from UI
code either; `reqwest`+`serde_json` already covered everything needed).

**Known, inherited quirk, ported not fixed** (`core-port.md` says reuse
unchanged): `execute.ts`'s credential-key prefetch only scans
`request.headers`/`request.body`, never `request.query` — a `credential`
`ValueSource` inside `query` (structurally legal, though the validator
rejects it and no fixture uses one) would always resolve
`missing-credential` regardless of vault contents. Documented in
`runtime/execute.rs`'s own doc comment, not silently corrected.

**Verified on macOS, not on Windows or Linux — flagged rather than
assumed,** the same gap 12.1–12.3 recorded. `cargo fmt --check` and
`cargo clippy --all-targets -- -D warnings` ran clean. Three test tiers:
(1) `cargo test --lib` — 41 tests, porting `validate.test.ts`'s cross-field
cases (including the real `search.manifest.json` fixture validating
unchanged), `execute.test.ts`'s request-building/response-mapping cases
against that same real fixture, and `grants.test.ts`'s isolation/revoke
cases, all mock-backed for speed; (2)
`apps/desktop/src-tauri/tests/connector_dispatch.rs` — **not** `#[ignore]`d
— a real `tokio::net::TcpListener` on `127.0.0.1` serving one fixed HTTP
response, dispatched through the real `execute_connector_call` end to end
(real TCP, real HTTP, real JSON mapping) on a scratch manifest, since
`search.manifest.json`'s own origin (`https://searx.example.org`) is RFC
2606's reserved, non-resolving example domain and cannot be dialed for
real without rewriting the fixture under test: `test
dispatches_a_real_request_over_real_tcp_and_maps_the_response ... ok`;
(3) `tests/vault_smoke.rs` re-verified still green (task 12.3's own test,
unaffected by this task's changes to `secure_storage`, which only added a
test-only in-memory keyring backend shared by every module's tests).

---

#### ✅ 12.5 — Tier 3 native handler registry (Tauri)

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

`connectors/runtime/native_handlers.rs` mirrors `nativeHandlers.ts`: a
private capability→handler map plus `native_handler_for()`. `device.info`
(the same proof-of-life capability name mobile uses) is implemented with
`sysinfo` — hostname + OS name + OS version, the cross-platform proxy
research 0010 itself suggested, since mobile's `modelName`/`osName`/
`osVersion` triple has no desktop equivalent. `execute_connector_call`'s
Tier 3 branch (stubbed "not implemented" since it was written a task early,
in 12.4) now mirrors `executeTier3` exactly: `is_allowed` → registry lookup
→ argument normalization → handler call, `Result<String,String>` mapped to
`ExecutionResult::Ok`/`Err(HandlerError)`. One new Tauri command,
`device_info`, wraps `execute_connector_call` directly rather than
duplicating its gating logic, so the IPC path and any future internal
caller (tool-routing, not built yet) share one source of truth.

**Belt-and-braces, for real, not just declared.** This task also closed the
gap 12.1/12.2/12.3 flagged and explicitly deferred here: Tauri v2's ACL only
gates *plugin*-provided commands by default, so this app's own commands
(`list_models`, `generate`, etc.) were reachable regardless of
`capabilities/default.json` until now. `build.rs` now calls
`tauri_build::try_build` with `Attributes::new().app_manifest(AppManifest::new()
.commands(&[...]))` listing every command this app registers (not just
`device_info` — leaving the rest ungated would have been a half-measure),
and `capabilities/default.json` grants each an individual `allow-<command>`
permission — no wildcard, this repo's own stated convention. **Found by an
actual build failure, not assumed correct:** the identifier format is
kebab-case, not the snake_case the doc comment implies — `install_model`'s
autogenerated permission is `allow-install-model`, confirmed by
`tauri-build` itself rejecting `allow-install_model` at build time
(`invalid plugin or permission identifier ... identifiers can only include
lowercase ASCII, hyphens`) before the correct spelling was written down.

**Verified on macOS, not on Windows or Linux — flagged rather than
assumed,** the same gap 12.1–12.4 recorded. `cargo fmt --check` and
`cargo clippy --all-targets -- -D warnings` ran clean. `cargo test --lib`
(45 tests) includes real, unmocked Tier 3 coverage — `device_info` returns
real non-empty on-device text when granted, is refused `not-permitted` when
never granted, and (matching the review checklist's own wording precisely)
`revoking_a_tier3_grant_blocks_the_native_handler`: granted → succeeds,
`revoke()`'d → blocked, using the real `grants.rs`/`native_handlers.rs`
code with no mocking at all (unlike the credential-touching tests
elsewhere, `device.info` never touches the vault, so there's nothing to
mock here). Separately, the real debug binary was built and launched
(`scripts/ci/launch-smoke.js`, the same "still running N seconds later" bar
12.1 established) after wiring `build.rs`'s new ACL mechanism, confirming
the whole boot sequence — ACL generation included — works end to end, not
just that `cargo check` passes. **Gap flagged rather than faked:** this
environment has no way to drive a native window's WebKit inspector, so the
literal "invoke `device_info` from the devtools console" step mobile's own
iOS Simulator bar implies wasn't performed manually — the equivalent real
coverage instead comes from the unmocked Rust-level test above plus the
real build/launch check, which exercise the identical code path (`is_allowed`
→ registry → handler) without needing a hand click.

---

#### ✅ 12.6 — `packages/desktop-ui` initial component set

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

Also populated `packages/design-tokens` as part of this task — nothing else
in the epic claimed that extraction, and `desktop-ui`'s own deliverable
("built against `packages/design-tokens`, per that package's own README")
required it to exist first. Both packages were empty scaffolds beforehand,
the same state `packages/core` was in before task 12.2. Styled via CSS
Modules + CSS custom properties, no new styling-library dependency (none
existed in this repo before this task); `ThemeProvider` sets every token as
a `--sv-*` custom property from the live `Theme` object each render, so
there's no parallel CSS copy of the palette to keep in sync by hand. This
is also the first `packages/*` → `apps/*` workspace dependency exercised in
this repo (`apps/desktop/package.json`'s `"desktop-ui": "workspace:*"`) —
required adding `apps/desktop/src/vite-env.d.ts` (`/// <reference
types="vite/client" />`), a genuine pre-existing gap from task 12.1's own
scaffold that only surfaced once something actually imported a `.module.css`
file through it.

**One necessary deviation from mobile, not an oversight:** mobile's
`Toggle` wraps React Native's native `Switch`, deliberately untinted — its
own doc comment explains two attempts to theme it made dark mode *worse*.
The web has no equivalent "free, already-legible OS switch" to defer to
(`<input type="checkbox">` renders as a checkbox, not a switch, and isn't
reliably restylable as one across engines), so desktop's `Toggle` is a
themed `role="switch"` button built from scratch instead.

**Verified — real browser, real DOM, not just a passing typecheck:**
`pnpm typecheck`/`pnpm lint` clean workspace-wide. Ran `apps/desktop`'s
actual Vite dev server and viewed all five components in the sandboxed
Browser pane: correct light/dark theming via CSS custom properties, correct
accessibility tree (`Toggle` reports as `switch "Notifications"`, not a
generic button — confirmed via the accessibility tree, not assumed from the
JSX), zero console errors, and the full expected text content present via
the rendered DOM. **Honest gap:** this is a real browser rendering real
code, but it is not one of the three WebView engines the checklist actually
asks about (WebKit/macOS, WebView2/Windows, WebKitGTK/Linux) — this
environment has no way to launch or screenshot the real Tauri window, the
same limitation 12.5 hit. So this verifies the components/tokens work, not
cross-engine parity specifically — flagged rather than claimed.

---

#### ✅ 12.7a — Grammar-constrained tool-calling in the Rust engine

**Goal:** Give the desktop `EngineAdapter` real tool-calling, so task 12.7's
review checklist ("a granted Tier 1 connector answers and is visibly marked
as having done so") is something the engine can actually do, not something
the chat UI would have to fake. Split out of task 12.7 rather than folded
into it: mobile's tool-calling rides entirely on `llama.rn`'s own
jinja/chat-template machinery (`chatTemplates.jinja.defaultCaps.tools`,
OpenAI-shaped `tools`/`tool_choice`/`tool_calls` passed straight through to
`context.completion`), and `llama-cpp-2` — task 12.2's own crate choice —
exposes none of that, only low-level GBNF grammar-sampler primitives
(`LlamaSampler::grammar`) with no JSON-Schema→GBNF converter and no
chat-template tool-capability introspection. Building both was real,
separable engine work, not "wire up a UI."

**Deliverables:**

- `engine::grammar`: a JSON-Schema-subset → GBNF converter and a fixed
  decision-envelope grammar (`{"answer": "..."}` /
  `{"tool_call": {"name": "...", "arguments": {...}}}`), built fresh per
  call from the tools offered.
- `engine::adapter`: wires the grammar into the sampler chain when
  `GenerateOptions.tools` is non-empty and parses the constrained output
  back into `GenerateResult.tool_calls`.
- `connectors::routing` (`route_message`, mirroring
  `connectors/routing/route.ts`) and `connectors::orchestration`
  (`generate_with_connectors`, mirroring `settings/connectorOrchestration.ts`)
  — the routing-decision and connector-execution-with-fallback logic task
  12.7's chat UI will call into.
- A `generate_chat` Tauri command (`off`/`auto`/`required` connector modes)
  exposing all of the above through IPC, ahead of task 12.7's UI existing to
  call it.

**Dependencies:** Tasks 12.2, 12.4.

**Review checklist:**

- A real on-device model, given a granted Tier 1 connector and forced tool
  use, actually emits a grammar-constrained tool call — executed for real
  against a local test server — and the reply comes back tagged with the
  connector's name. Proven by a real model, not a mock or a fake engine.

**Deliberate protocol difference from mobile:** rather than reproduce
llama.cpp's native `<tool_call>`/chat-template tool syntax, this ships its
own fixed JSON decision envelope, constrained by a GBNF grammar this module
builds per call. This makes tool-calling here **model-agnostic** — it works
for any instruction-following model, not only ones whose GGUF chat template
happens to declare tool support — so `EngineInfo.tool_capable` is
unconditionally `true` once a model is loaded, unlike mobile's
template-dependent flag. Mobile's fourth `RoutingDecision` case,
`unsupported` (reached when the model's template can't tool-call), is
consequently unreachable here and isn't in the Rust `RoutingDecision` enum
at all. **Scope limit, checked not assumed:** the grammar builder supports
only flat JSON-Schema objects with `string`/`number`/`integer`/`boolean`
properties; an unsupported schema shape fails loudly
(`GrammarError`) rather than building a grammar that can't represent it.

**Two real, on-device-only bugs this task's own review checklist caught —
neither visible to any unit test, both pre-existing in code earlier tasks
shipped:**

1. `generate_inner` called `sampler.accept(token)` manually *after*
   `sampler.sample()`, which already accepts internally
   (`llama_sampler_sample` is documented as "sample and accept"). Harmless
   for the old stateless temp/dist-only chain, but a real double-accept
   once a stateful grammar sampler joined it — the grammar's parse position
   ran two tokens ahead of what was actually generated, eventually walking
   past a satisfied rule into an empty parse state and crashing
   (`GGML_ASSERT(!stacks.empty())`, in llama.cpp's own grammar code) on the
   next sample call. Fixed by removing the redundant manual `accept`.
2. `EngineAdapter::generate()` never cleared the context's KV cache between
   calls, so a second call on the same loaded model (routing's
   tool-decision call followed by orchestration's final-answer call, both
   against one context) started its prompt batch at position 0 while the
   cache still held entries through the first call's last position —
   llama.cpp rejects that as non-consecutive sequence positions and decode
   fails outright. Fixed with `ctx.clear_kv_cache()` at the start of every
   `generate()` call. Invisible before this task because nothing before it
   ever called `generate()` twice on one loaded context.

**Verified — real model, real grammar, real network, not mocks:** `cargo
fmt --check` / `cargo clippy --all-targets -- -D warnings` clean. Full
`cargo test` (62 unit tests, no `--ignored`) covers the grammar builder,
routing decisions (unknown tool / not-permitted / malformed-arguments /
granted paths, against a canned `FakeEngine` implementing a new
`GenerativeEngine` trait — the same testability seam
`models::LoadedModelHandle` already established), and orchestration
(required-with-nothing-offered short-circuit, blocked-decision fallback,
execution-failure fallback, and a successful tool-call round trip against a
real local TCP server). `cargo test --test tool_calling_smoke -- --ignored
--nocapture` on-device (macOS): a real Qwen2.5 0.5B model, forced to call
the Search tool against a granted connector fixture pointed at a local test
server, produced a real grammar-constrained `tool_call` JSON, executed it
for real, and returned a final answer tagged `connector: Some("Search")` —
this is what caught both bugs above. `cargo test --test engine_smoke --
--ignored --nocapture` re-run afterward to confirm the KV-cache fix didn't
regress the plain (no-tools) generation path.

---

#### ✅ 12.7 — Minimal offline chat UI

**Goal:** Enough UI to exercise tasks 12.2–12.5 and 12.7a end to end and
verify them the way this repo's own convention requires — a real behavior
check, not a green test suite — mirroring the role mobile's task 1.3 played
inside its own Core Inference & Chat epic rather than inside App Shell.

**Deliverables:**

- A single chat screen: model selection, message input/output, and the same
  in-chat connector-provenance marker mobile's task 2.5 established
  (`connector?: string` on the reply), calling task 12.7a's `generate_chat`
  command rather than reimplementing routing/orchestration in the UI layer.

**Dependencies:** Tasks 12.2, 12.4, 12.6, 12.7a.

**Review checklist:**

- A fully offline conversation works end to end on-device with no connector
  installed, and a granted Tier 1 connector answers and is visibly marked as
  having done so — the desktop equivalent of task 2.5's own review bar.

**Implementation:** `apps/desktop/src/chat/ChatScreen.tsx`, mirroring
`apps/mobile/src/chat/screens/ChatScreen.tsx`'s `send()` (streaming via
per-token events, final text/connector taken from the resolved result rather
than trusted from the accumulated stream — mobile's own test for a reply
that streamed zero tokens) and `apps/mobile/src/models/screens/
ModelsScreen.tsx`'s install-then-load dispatch — folded into one screen
rather than two, since desktop has no navigation/settings shell yet
(`core-port.md`'s own "deliberately out of scope" note) to put a separate
Models screen behind. `apps/desktop/src/lib/tauri.ts` is a thin, typed
`invoke`/`listen` wrapper layer, with every field's casing checked against
its actual Rust `serde` attributes rather than assumed uniform (`generate_
chat`'s own request struct is snake_case on the wire, unlike the camelCase
`ManagedModel`/`GenerateChatResponse` — getting this wrong fails silently,
as an absent optional field, not a deserialize error).

**New Tauri commands, added because the checklist needs them, not
speculatively:** `connector_status` and `set_search_connector_granted` —
desktop has no Settings → Connectors screen (out of scope for this epic),
so the chat screen's own `Toggle` next to the Search connector's `ListItem`
is the only lever a user has over consent, backed directly by
`connectors::permissions::grant`/`revoke`. `CommandError` gained a `Vault`
variant (`secure_storage::VaultError` didn't derive `Serialize` — nothing
had crossed the IPC boundary needing it before `revoke`'s own error type).

**Verified:**

- `pnpm --filter desktop exec tsc --noEmit` / `eslint .` clean;
  `pnpm exec prettier --check` clean. `cargo fmt --check` / `cargo clippy
  --all-targets -- -D warnings` / `cargo test --lib` (62 tests) clean after
  the two new commands.
- Real Vite dev server viewed in a real browser: correct dark-theme
  rendering, correct initial state (`"Loading models…"`, disabled composer,
  `"Choose a model first"` placeholder), zero console errors, and no crash
  from `invoke()` rejecting outside a real Tauri runtime (this pane has no
  Tauri backend to talk to, so this exercises rendering and graceful
  degradation, not the commands themselves).
- The real debug binary (`cargo build`, then `scripts/ci/launch-smoke.js`)
  launched and stayed running past the check window with all 14 commands
  registered and ACL-gated — proves `build.rs`'s `COMMANDS` list and
  `capabilities/default.json` stayed consistent (a mismatch is a build- or
  setup-time failure, per task 12.5's own established pattern), not just
  that the frontend compiled.
- The underlying behavior this screen's checklist cares about —
  offline generation, and a granted connector answering and getting
  tagged — was already proven for real, on-device, against the exact
  `generate_chat`/`generate_with_connectors` code path this screen calls,
  by task 12.7a's own `tests/tool_calling_smoke.rs`.
- **Honest gap:** this environment has no way to drive the actual native
  Tauri window (no simulator/browser-automation tool reaches a real
  WebView2/WebKit app window here, the same limitation every desktop task
  since 12.5 has flagged), so clicking "Send" in the real, running app and
  watching a reply arrive was not performed by hand. The verification above
  is the strongest chain available without that: real rendering, a real
  running binary with correct IPC wiring, and the real on-device generation
  path already proven by 12.7a — not a substitute for actually watching it
  happen, and flagged as such rather than claimed.

---

#### ✅ 12.8 — Writing-assist modes (desktop port)

**Goal:** Port mobile's task 1.4 — the concrete scenario-1 use case
(brainstorm, grammar-fix, rewrite tone, draft from bullet points) — to
desktop chat. Closes the single largest UX gap a feature audit found
between the two apps: desktop's chat screen has no writing-assist modes at
all today, only plain chat with `auto`/`off` connector routing.

**What already exists and needs no change** (confirmed by reading the
code, not assumed): `ConnectorMode` already carries `'required'`
end-to-end — TS type → `generate_chat`'s Rust enum → `ToolChoice::Required`
— desktop's connector layer already supports Search-style forcing, only
`ChatScreen.tsx` has never sent it. `generateChat()`'s wrapper already
accepts `temperature`; per-mode temperature needs no API change.
`ManagedModel.parametersB` is already fetched by `ChatScreen.tsx` via
`listModels()` on mount and currently discarded — the model-size data the
risk banner needs is already in memory, just not stored into state.

**Decided: modes stay entirely client-side, mirroring mobile's own
architecture exactly** — no new Tauri command, no new field on
`GenerateChatRequest`. A mode's system prompt is a `ChatMessage{role:
'system', content}` prepended into the same `messages` array already
sent, identical to how mobile's `ChatScreen.send()` builds `history`
today; `generate_chat`'s Rust side needs zero changes since system-prompt-
via-message is already the only mechanism that exists at the engine
layer (confirmed: no `system_prompt` field exists on `GenerateOptions` on
either platform). This makes 12.8 a frontend-only task.

**Deliverables:**

- `apps/desktop/src/chat/modes.ts` — a direct port of
  `apps/mobile/src/chat/modes/modes.ts`'s six modes (`plain`, `search`,
  `brainstorm`, `grammar`, `tone`, `draft`), same `id`/`label`/`banner`/
  `systemPrompt`/`temperature`/`usesHistory`/`cautionBelowB` fields, same
  prompt copy and temperatures — these were empirically tuned against the
  smallest catalog model (mobile's own review checklist), not invented
  fresh here.
- `ChatScreen.tsx`: `modeId` state; `send()` derives `connectorMode`
  (`search` → `'required'`, `plain` → `'auto'`, else `'off'`) and
  `temperature` from the active mode, prepends the mode's system message
  when set, and drops history when `usesHistory` is false — mirroring
  mobile's `send()` exactly, including the "mode's prompt is prepended
  fresh each turn, not stored in message history" behavior (so switching
  modes takes effect on the next reply, not retroactively).
- A `ModeBar`-equivalent: a new, bespoke component (not a `desktop-ui`
  primitive — mobile's own `ModeBar` lives inside `ChatScreen.tsx`, not
  its design system either, since no other screen needs mode chips), row
  of selectable chips above the composer, in the existing unused space
  between the message list and `<footer>`. No existing `desktop-ui`
  component has selected-state chip semantics (`Button` has no
  `active`/`selected` variant) — needs its own CSS module, `aria-pressed`
  (or equivalent) for the selected state, and an accessible name following
  mobile's exact convention (`"${label} mode"`) so the two platforms'
  screen-reader behavior matches.
- A risk banner mirroring mobile's `OfflineBanner` risk branch: shown when
  `mode.cautionBelowB !== null && activeModelParamsB !== null &&
  activeModelParamsB < mode.cautionBelowB` — today only `draft` at `< 1`.
  Copy adapted from mobile's (`"{model} is small enough to invent details
  that were not in your notes..."`), with the "switch to a larger model"
  call-to-action pointing at desktop's own `onNavigate('models')` instead
  of mobile's Models tab.

**Dependencies:** Task 12.7 (the chat screen this extends).

**Review checklist** (mirrors mobile's task 1.4 bar — measured behavior,
not just "the UI renders"):

- Each mode produces a materially different, appropriate transformation of
  the same input text, measured against whatever model is actually loaded
  on this machine at the time (mobile's own review found real,
  model-size-dependent failure modes — brainstorm restating one idea
  several ways, draft inventing a figure below 1B — these are worth
  re-checking on desktop's own inference path, not assumed identical just
  because the prompts are copied).
- A mode's system prompt reaches the model only via the current turn, not
  retroactively rewriting prior turns already in `messages` state.
- `connectorMode` sent to `generate_chat` is `'required'` for Search,
  `'off'` for every non-plain, non-search mode, `'auto'` for plain chat —
  verified by inspecting the actual request, not just trusting the code
  path.
- The draft risk banner appears only for `draft` mode below the 1B
  threshold and is absent for every other mode regardless of model size.
- Revoking the Search connector's permission does not affect any other
  mode's availability, and switching away from Search mode does not
  require the connector to still be granted.

**Verified:** `apps/desktop/src/chat/modes.ts` is a byte-for-byte port of
mobile's six modes (prompts, temperatures, `usesHistory`, `cautionBelowB`
all unchanged). `pnpm typecheck` / `pnpm lint` / `pnpm exec prettier
--check` clean. Real Vite dev server viewed in a real browser: all 6
chips render with the exact `"${label} mode"` accessible names mobile's
own tests assert on (`"Fix grammar mode"`, `"Search mode"`, etc.),
clicking a chip flips `aria-pressed` on exactly one chip at a time
(confirmed via `document.querySelectorAll`, not just visually), and the
header subtitle composes the active mode's `banner` text after the base
sentence exactly when `modeId !== 'plain'` — mirroring mobile's own
conditional-join composition. Zero console errors. A real debug build
(`pnpm tauri build --debug --no-bundle`, embedding the new frontend
bundle) and `scripts/ci/launch-smoke.js` confirm the real binary still
launches and stays running with `ChatScreen.tsx`'s changed import surface
— `cargo clippy --all-targets -- -D warnings` also clean (no Rust
changed, cheap insurance regardless).

**Honest gap:** this sandboxed environment has no Accessibility/
screen-capture access, so — the same limitation task 14.3 flagged —
neither the real native Tauri window nor a synthetic mocked-IPC round
trip could be driven here: browser navigation always creates a fresh JS
context, so there's no way to pre-seed a mock `window.__TAURI_INTERNALS__`
bridge before the app's own module evaluates in this tooling (confirmed
by testing it, not assumed). The actual `connector_mode`/`temperature`/
system-prompt-and-history request shape sent to `generate_chat` per mode
was verified by code review and typechecking, not by inspecting a live
request — a genuine gap from the review checklist's own bar, not silently
skipped. The UI-rendering, selection-state, and build/launch verification
above is the strongest chain available without that.

---

#### ✅ 12.9 — Debug-only runtime offline tripwire

**Goal:** Close a real defense-in-depth asymmetry a feature audit found:
mobile has a *runtime* check (`offlineTripwire.ts`, replaces the network
globals with throwing stubs, dev-only) that catches a network violation
the static checks miss; desktop had only structural guarantees (Tier 1's
origin allowlist) proven by tests, nothing that runs and actively fails
against a *new* unsanctioned code path.

**Deliverables:**

- New `net_guard.rs`: a debug-only guard hooking `reqwest`'s DNS
  resolution (the closest real interception point Rust offers — there is
  no ambient global like `fetch` to monkey-patch). `guarded_client_builder()`
  attaches a custom resolver that refuses to resolve any hostname unless
  the calling task is inside an `allow_network(...)` scope
  (`tokio::task_local`-backed — the direct analogue of mobile's own
  `allowNetworkForConnector`).
- Both real network egress points in the app wired through it:
  `connectors::runtime::execute::client()`/its one `.execute()` call, and
  `models::download`'s `run_download`/`lib.rs`'s `install_model`.
- New `clippy.toml` (`disallowed-methods` banning
  `reqwest::Client::new`/`::builder()` outside `net_guard.rs`) plus
  `lib.rs`'s `#![warn(clippy::disallowed_methods)]` — the closest
  available analogue to mobile's ESLint restricted-globals rule, closing
  (partially, not fully) the gap that the guard only protects code that
  opts in.
- New [`docs/desktop-network-audit.md`](../../desktop-network-audit.md),
  structured like mobile's own `docs/network-audit.md`, honestly scoped
  to what desktop actually has.

**Dependencies:** Task 12.4 (the connector runtime this wraps), Task 12.2
(the model download path this wraps).

**Review checklist:**

- A request outside `allow_network(...)` is actually blocked, with the
  guard's own error, not a generic connection failure; a request inside
  the scope actually reaches a real server; the guard re-arms after a
  scope ends rather than becoming a one-way latch.

**Decided: an honest, narrower mechanism, not a claimed port.** Rust's
lack of an ambient network global means this cannot match mobile's
coverage, and the docs say so rather than implying otherwise. Two blind
spots stated plainly in both `net_guard.rs`'s own doc comment and the new
audit doc: a request to a literal IP address skips DNS resolution
entirely (reproduced, not hypothetical — the existing
`tests/connector_dispatch.rs` and `download.rs`'s own cancellation tests
both use `127.0.0.1` and pass regardless of `allow_network`, which is
exactly this blind spot in practice); and the guard only protects
`reqwest::Client`s built via `guarded_client_builder()` — nothing catches
a stray `reqwest::Client::new()` except the clippy lint, which can be
silenced at the call site. reqwest's own default resolver (`GaiResolver`)
turned out to be `pub(crate)`, not reachable from outside its own crate —
discovered only by attempting to use it, not by reading the docs first —
so the allowed path delegates to `tokio::net::lookup_host` instead, the
same underlying OS resolution mechanism called directly.

**Verified:** `cargo fmt --check`/`clippy --all-targets -- -D warnings`
clean (confirmed the lint actually fires: a scratch `reqwest::Client::new()`
call was temporarily added, clippy flagged it by name, then it was
removed before committing). `cargo test --lib` (75/75, including 3 new
`net_guard` tests against a real local `TcpListener` server reached via
`localhost` — not `127.0.0.1` — to actually exercise DNS resolution: one
proving an unguarded request is blocked with the tripwire's own error
text pulled from the full `source()` chain, one proving a guarded request
reaches the real server, one proving the guard re-arms after the scope
ends). `cargo test --test connector_dispatch` still passes — its own
IP-literal request is unaffected by the guard, confirming that documented
blind spot in practice. Real debug binary build
(`pnpm tauri build --debug --no-bundle`) + `scripts/ci/launch-smoke.js`
confirm the guard doesn't break real model loading at startup. **Honest
gap:** this mechanism does not achieve mobile's coverage — it is a real,
executable check where there was previously none, not full parity with
an ambient-global interception Rust has no equivalent primitive for.

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0001](../../research/0001-concept-and-connector-architecture.md)
- [Desktop network audit](../../desktop-network-audit.md) — task 12.9's
  own audit document, mirroring mobile's `network-audit.md`
- [Desktop Shell](shell.md) — epic 9, the shell-technology decision this
  depends on
- [research 0010](../../research/0010-desktop-shell-technology.md)
- [Core Inference & Chat](../mobile/core-inference-chat.md) (epic 1) and
  [Connector Framework](../mobile/connector-framework.md) (epic 2) — the
  mobile epics this one ports
