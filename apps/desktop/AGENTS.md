# AGENTS.md — apps/desktop

Epic 9 (Desktop Shell, [docs/epics/desktop/shell.md](../../docs/epics/desktop/shell.md))
is resolved: **Tauri v2** — see
[research 0010](../../docs/research/0010-desktop-shell-technology.md) for the
full comparison against Electron and a React Native desktop renderer.
Workspace-wide rules live in the [root AGENTS.md](../../AGENTS.md).

## What this is

A Tauri window with real on-device inference (task 12.2), per-connector
credential storage (task 12.3), a working Tier 1 (HTTP) connector runtime
(task 12.4), a Tier 3 native handler registry (task 12.5, `device_info`),
a real `desktop-ui` component set (task 12.6), grammar-constrained
tool-calling wired through routing/orchestration into a `generate_chat`
command (task 12.7a), and a full navigation shell (`src/shell/AppShell.tsx`,
task 13.1) with four real destinations: Chat (`src/chat/ChatScreen.tsx`,
task 12.7 then consolidated in 13.5 to just chat — message send/stream/
connector-tagging, a compact model/connector indicator linking out), a real
Models screen (`src/models/ModelsScreen.tsx`, task 13.2 — install/activate/
remove with real download progress), a real Connectors screen
(`src/connectors/ConnectorsScreen.tsx`, task 13.3 — a real grant/revoke
list, one row today), and a real Settings screen
(`src/settings/SettingsScreen.tsx`, task 13.4 — live theme preference, app
version). Epics 12 (Desktop Core Port) and 13 (Desktop App Shell) are both
done; see
[docs/epics/desktop/core-port.md](../../docs/epics/desktop/core-port.md)
and
[docs/epics/desktop/app-shell.md](../../docs/epics/desktop/app-shell.md)
for what each task delivered.

## Before writing more code here

Epics 12 and 13 are both closed — epic 12 briefly reopened for task 12.8
(writing-assist modes, a direct port of mobile's task 1.4, closing the
single largest UX gap a feature audit found between the two apps) and
closed again once it landed. Epic 14 (Desktop Distribution & Signing —
real signed/notarized installer artifacts and a self-update mechanism) is
nearly done: tasks 14.1, 14.3, and 14.4 are all complete — only 14.2 (code
signing/notarization) remains, explicitly skipped for now (no Apple
Developer ID certificate available). 14.1 (installer artifacts): real
macOS/Linux builds. 14.3 (update mechanism): `tauri-plugin-updater`, a
real Ed25519 signing keypair, GitHub Releases hosting. 14.4 (release
pipeline): a `workflow_dispatch` CI workflow that bumps versions, tags,
builds, signs, and publishes real macOS/Windows/Linux artifacts in one
run — closing 14.1's Windows gap for real via a `windows-latest` runner.
**`v0.1.5` is published**, this app's first real release, and
`releases/latest/download/latest.json` now resolves to it — task 14.3's
updater is genuinely live, not just built. All of this proceeded
deliberately without 14.2 (the two signing schemes are independent; an
update to this still-unsigned app triggers the same Gatekeeper warning a
fresh install does). See
[docs/epics/desktop/distribution.md](../../docs/epics/desktop/distribution.md).
Check `ROADMAP.md` before starting anything here: whether epic 14 continues
next, mobile's own remaining Phase 1 item (0.1.20), or something else is
actually scheduled is an open call, not decided by this file.
`packages/mobile-ui` stays irrelevant to any future desktop work either
way: Tauri renders a web
frontend, not React Native primitives.

## State of play

- **Scaffold (12.1) + on-device inference (12.2).** `src-tauri/src/engine/`
  and `src-tauri/src/models/` mirror `apps/mobile/src/chat/inference/` and
  `apps/mobile/src/models/` closely (`packages/core` still hasn't been
  extracted). `lib.rs` registers Tauri commands
  (`list_models`/`install_model`/`load_model`/`generate`/etc.) over them,
  plus a best-effort startup bootstrap that loads the last-used model.
  Consumed by the real chat screen since task 12.7 — see below.
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
- **`desktop-ui` component set (12.6).** `packages/design-tokens` (also
  populated this task — nothing else claimed that extraction) and
  `packages/desktop-ui` were both empty scaffolds beforehand, the same
  state `packages/core` was in before 12.2. `desktop-ui`'s `ThemeProvider`
  sets every token as a `--sv-*` CSS custom property from the live `Theme`
  object each render (no parallel CSS copy to keep in sync by hand);
  components use CSS Modules, no new styling-library dependency. This is
  also the first `packages/*` → `apps/*` workspace dependency exercised in
  this repo (`"desktop-ui": "workspace:*"` in `package.json`) — needed a
  genuinely missing `src/vite-env.d.ts` (`/// <reference types="vite/client"
  />`) to resolve `.module.css` imports, a real gap from 12.1's own scaffold
  that only surfaced once something imported one through it. `Toggle`
  necessarily differs from mobile's own (a themed `role="switch"` button,
  not a wrapped native control — see `packages/desktop-ui/README.md` for
  why mobile's own approach doesn't transfer to the web). Verified via
  `apps/desktop`'s real Vite dev server rendered in a real browser (DOM
  text, accessibility tree, zero console errors) — not the three actual
  Tauri WebView engines the review checklist names, which this environment
  can't launch or screenshot; flagged as a gap, not claimed.
- **Grammar-constrained tool-calling (12.7a).** `engine::grammar` converts
  a flat JSON-Schema subset into a GBNF grammar for a fixed decision
  envelope (`{"answer": "..."}` / `{"tool_call": {...}}`) — a deliberate
  protocol difference from mobile's native chat-template tool syntax,
  since `llama-cpp-2` exposes no jinja/tool-template machinery the way
  `llama.rn` does. `EngineInfo.tool_capable` is therefore unconditionally
  `true` (this mechanism is model-agnostic), unlike mobile's
  template-dependent flag. `connectors::routing::route_message` and
  `connectors::orchestration::generate_with_connectors` port `route.ts`/
  `connectorOrchestration.ts`, tested against a canned `FakeEngine`
  (`GenerativeEngine` trait, the same testability seam
  `models::LoadedModelHandle` established) — no model weights needed for
  the 11 routing/orchestration unit tests. A new `generate_chat` command
  exposes `off`/`auto`/`required` connector modes over IPC, ahead of 12.7's
  UI existing to call it. **Two real bugs, found only by the on-device
  test, not any unit test:** `generate_inner` was double-accepting every
  sampled token (harmless for the old stateless chain, fatal once a
  stateful grammar sampler joined it — crashed llama.cpp's own grammar
  code after ~2 tokens); and `EngineAdapter::generate()` never cleared the
  context's KV cache between calls, so a second call on one loaded model
  (routing's decision call, then orchestration's final-answer call) failed
  outright on non-consecutive sequence positions. Both fixed; both
  pre-existed this task, just never exercised by anything that called
  `generate()` twice on one context before. Verified with a real Qwen2.5
  0.5B model forced to call a granted Search-connector fixture against a
  local test server — real grammar-constrained JSON, real HTTP dispatch,
  real folded final answer tagged `connector: Some("Search")`.
- **Real chat screen (12.7).** `src/chat/ChatScreen.tsx` replaces task
  12.6's component gallery — model list (install/load dispatch, mirroring
  `ModelsScreen.tsx`), message list via `ChatBubble`, streaming via the
  `generate-token` event, and a `Toggle` next to the Search connector's
  `ListItem` as the only consent lever (no Settings → Connectors screen
  exists yet, out of this epic's scope) — bound to two new commands,
  `connector_status`/`set_search_connector_granted`, added because the
  checklist needed a way to actually grant the connector, not
  speculatively. `src/lib/tauri.ts` is a thin typed `invoke`/`listen`
  wrapper layer; every field's casing was checked against the actual Rust
  `serde` attributes (`generate_chat`'s request struct is snake_case on the
  wire, unlike the camelCase `ManagedModel`) rather than assumed uniform.
  Verified: `tsc --noEmit`/`eslint`/`prettier --check` clean; real Vite dev
  server viewed in a real browser (correct dark theme, correct initial
  state, zero console errors, no crash from `invoke()` rejecting outside a
  real Tauri runtime); the real debug binary launched and stayed running
  (`scripts/ci/launch-smoke.js`) with all 14 commands ACL-consistent. The
  underlying behavior the checklist cares about (offline generation, a
  granted connector answering and getting tagged) was already proven
  on-device by 12.7a's own test against the exact code this screen calls.
  **Honest gap:** no tool here can drive the actual native window, so
  clicking "Send" and watching a reply arrive wasn't done by hand — flagged,
  not claimed, the same gap every desktop task since 12.5 has hit.
- **Writing-assist modes (12.8).** `src/chat/modes.ts` is a byte-for-byte
  port of mobile's own `chat/modes/modes.ts` — same six modes (`plain`,
  `search`, `brainstorm`, `grammar`, `tone`, `draft`), same prompts,
  temperatures, `usesHistory`, `cautionBelowB`; nothing re-derived. Confirmed
  by reading the code first that this needed **no Rust changes at all**:
  `ConnectorMode` already carried `'required'` end-to-end, `generateChat()`
  already accepted `temperature`, and `ManagedModel.parametersB` was already
  fetched by `ChatScreen.tsx` and simply discarded — a mode's system prompt
  is just a `ChatMessage{role: 'system'}` prepended into the same array
  already sent, the identical mechanism mobile uses. New `ModeBar.tsx` +
  `.module.css` (bespoke — no `desktop-ui` primitive has chip/selected-state
  semantics; mobile's own `ModeBar` isn't a design-system component either)
  renders the six chips with `aria-pressed` selected state and
  `"${label} mode"` accessible names matching mobile's own test convention
  exactly. A risk banner (mirroring mobile's `OfflineBanner` risk branch)
  warns only for `draft` mode when the loaded model's `parametersB < 1`.
  **Verified:** `tsc`/`eslint`/`prettier` clean; real Vite dev server in a
  real browser — all 6 chips render with the correct accessible names,
  clicking one flips `aria-pressed` on exactly one chip (checked via
  `document.querySelectorAll`, not just visually), the header banner
  composes the active mode's text exactly when not `plain`, zero console
  errors; a real debug build (`pnpm tauri build --debug --no-bundle`,
  embedding the new frontend) launched and stayed running
  (`launch-smoke.js`). **Honest gap:** tried harder than prior tasks to
  close the "can't drive the real native window" gap — attempted mocking
  `window.__TAURI_INTERNALS__` in the real Browser pane to capture the
  actual `generate_chat` request per mode, but browser navigation always
  creates a fresh JS context, so there's no way to pre-seed the mock before
  the app's own module evaluates with the tools available here (confirmed
  by testing it). The exact per-mode `connector_mode`/`temperature`/
  system-prompt-and-history request shape was verified by code review and
  typechecking, not a captured live request — flagged, not claimed.
- **Debug-only runtime offline tripwire (12.9).** `src-tauri/src/net_guard.rs`
  — a real defense-in-depth gap a feature audit found: mobile has a
  runtime check (`offlineTripwire.ts`, dev-only) that catches a network
  violation the static checks miss; desktop had only structural
  guarantees. Rust has no ambient global to monkey-patch, so the
  interception point is DNS resolution instead:
  `net_guard::guarded_client_builder()` attaches a custom resolver that
  refuses to resolve any hostname unless the calling task is inside an
  `allow_network(...)` scope (`tokio::task_local`-backed). Both real
  egress points (`connectors::runtime::execute::client()`'s dispatch,
  `models::download`'s `run_download`) are wired through it. New
  `clippy.toml` (`disallowed-methods` banning `reqwest::Client::new`/
  `::builder()` outside `net_guard.rs`) plus `lib.rs`'s
  `#![warn(clippy::disallowed_methods)]` close, partially, the gap that
  the guard only protects code that opts in. **Two honest blind spots,
  stated in both the module doc and the new
  [desktop-network-audit.md](../../docs/desktop-network-audit.md):** IP
  literals skip DNS resolution entirely (reproduced, not hypothetical —
  the existing `tests/connector_dispatch.rs` and `download.rs`'s own
  cancellation tests both use `127.0.0.1` and pass regardless); and the
  guard only protects opted-in clients, unlike a monkey-patched global. A
  real discovery mid-implementation: reqwest's own default resolver
  (`GaiResolver`) is `pub(crate)`, not usable from outside its crate —
  the allowed path delegates to `tokio::net::lookup_host` instead (same
  underlying OS mechanism). Armed only in debug builds, the same
  deliberate choice mobile made (a Release-build crash from a boundary
  violation punishes the user for a bug the static checks should have
  caught). Verified: `cargo fmt`/`clippy --all-targets -- -D warnings`
  clean (confirmed the lint actually fires by temporarily adding a stray
  `reqwest::Client::new()` and watching clippy name it, then removing the
  scratch line); `cargo test --lib` (75/75, including 3 new tests against
  a real local server reached via `localhost` — not `127.0.0.1` — to
  actually exercise DNS resolution: blocked-outside-the-scope,
  succeeds-inside-the-scope, re-arms-after-the-scope-ends); real debug
  binary build + `launch-smoke.js`. **Honest gap:** does not achieve
  mobile's coverage — a real, executable check where there was none, not
  full parity with an interception primitive Rust doesn't have.
- **Navigation shell scaffold (13.1).** `src/shell/AppShell.tsx` — plain
  `useState` destination switch, no routing-library dependency (four flat
  destinations, no deep-linking need). Chat unchanged behind its own
  destination; Models/Connectors/Settings ship as real, honest empty
  states, not placeholders that reference task numbers in their copy.
  **Real bug this task's review caught:** the new screens rendered in the
  browser's default black serif font — `ChatScreen.tsx` sets `color`/
  `fontFamily` on its own root, but `color`/`font-family` only inherit
  from an ancestor that actually sets them, not from `ThemeProvider`'s CSS
  custom properties existing somewhere in the tree; nothing set them for
  the shell as a whole. Fixed on `AppShell`'s own root element. Verified
  in a real browser: all four destinations reachable via `ref`-targeted
  clicks, correct `aria-current`, correct theming after the fix, zero
  console errors.
- **Model manager screen (13.2).** `src/models/ModelsScreen.tsx` mirrors
  `apps/mobile/src/models/screens/ModelsScreen.tsx` exactly: tap dispatch
  (not installed → install; installed and active → remove; installed and
  not active → activate), subtitle names the action in words, same
  accessory label set, `destructive` styling on a failed download. Real
  progress via the `download-progress`/`download-phase` events (`tauri.ts`
  gained `removeModel`/`onDownloadPhase`). **Deliberate gap:** mobile also
  cancels a download on tap; desktop's `install_model` has no cancellation
  wired up yet (`DownloadOptions.cancel` hardcoded `None`), so a
  downloading row is read-only rather than pretending to support cancel.
  `ChatScreen.tsx`'s own inline picker is untouched — task 13.5 removes it.
- **Connectors & permissions screen (13.3).**
  `src/connectors/ConnectorsScreen.tsx` mirrors mobile task 2.2's own
  deliverable: a real list (one `ListItem` + `Toggle` per connector), not
  the single hardcoded row `ChatScreen.tsx` still has. Backed by two new
  generic commands, `list_connectors`/`set_connector_granted`, built
  against a shared `known_connector_manifests()` helper (today: just
  Search) — `connector_status`/`set_search_connector_granted` (12.7's
  original single-connector lever) are left untouched for `ChatScreen.tsx`
  rather than reworked, since task 13.5 removes that inline control
  anyway. No new permission logic — revoking still goes through task
  12.4's already-tested `connectors::permissions::revoke` (clears stored
  credentials, not just the grant flag).
- **General settings screen (13.4).** `src/settings/SettingsScreen.tsx`
  wires up `ThemeProvider`'s `system`/`light`/`dark` preference (built in
  12.6, unused until now) as a real `role="radiogroup"` — a plain styled
  control, not a new `desktop-ui` component, since one screen didn't
  justify it. No new state to propagate: every screen already renders
  under the one `ThemeProvider` `App.tsx` wraps `AppShell` in, so a change
  here is live everywhere for free — confirmed in a real browser (Chat's
  own chrome changed the instant Settings' radio changed) and confirmed
  `system` tracks the OS preference live, not just at first render
  (toggled the browser's emulated `prefers-color-scheme` both directions).
  App version via `@tauri-apps/api/app`'s `getVersion()`, which needed a
  new capability, `core:app:allow-version` — confirmed against the real
  generated `gen/schemas/desktop-schema.json`, not guessed.
- **Chat screen consolidation (13.5), closing epic 13.**
  `src/chat/ChatScreen.tsx` lost its inline model-picker list and connector
  `Toggle` — those live only in `ModelsScreen.tsx`/`ConnectorsScreen.tsx`
  now — replaced by two compact `Button`s that link out
  (`onNavigate: (destination: 'models' | 'connectors') => void`, a prop
  narrower than `AppShell`'s own `Destination` union, so Chat structurally
  can't navigate anywhere it shouldn't). Connector consent became
  read-only from Chat's side: `connectorGranted` is only ever read from
  `connectorStatus()` now, never written locally, so there's exactly one
  place that mutates consent (`ConnectorsScreen.tsx`), not two that could
  disagree. No behavior change to message send/stream/connector-tagging.
  Verified: `tsc`/`eslint`/`prettier` clean; real Vite dev server in a
  real browser — both indicator buttons correctly navigate to
  Models/Connectors and back via the sidebar, zero console errors; the
  real debug binary still builds and launches. **Honest gap:** the full
  install → grant → send → see-it-answered-and-tagged round trip through
  the actual native window wasn't walked by hand — every piece of it was
  already proven for real elsewhere (12.7a's on-device test for
  generation/routing, 13.2/13.3's own verification for install/remove and
  grant/revoke); what's unverified is the navigation glue, not the
  underlying operations.
- **Search connector setup screen (13.6).** Replaced the static,
  unconfigurable Search fixture (`manifest/fixtures.rs`'s
  `include_str!`'d `search.manifest.json`, origin
  `https://searx.example.org` — never dialable) with real user-entered
  config. New `connectors::search` module (`manifest.rs` builds real
  SearXNG/Tavily manifests; `config.rs` persists the chosen provider as
  `search-config.json`, colocated with `grants.json`, mirroring
  `models::store`'s fail-soft JSON pattern). `search_connector_manifest()`/
  `known_connector_manifests()` are now config-driven — Search only
  appears once configured, matching mobile's own `installedConnectors()`
  returning `[]` when unconfigured. New `set_search_connector_config`
  command reuses the existing `validate_manifest` (no new validation logic
  invented) plus a Tavily-key-non-empty check, writes the Tavily
  credential via `secure_storage::open_vault(...).write(...)` — the first
  UI-triggered vault write in this codebase, correcting a stale doc
  comment in `secure_storage/mod.rs` that claimed otherwise.
  `SearchSetupScreen.tsx` (new) is a direct port of mobile's own screen;
  `ConnectorsScreen.tsx` gained an empty-state "Not set up" row and a
  "Change provider or key" reconfigure row, both routing through a new
  non-sidebar `'connectors-setup'` destination on `AppShell`. **Real
  flaky-test bug this task's review caught:** two new Rust tests share the
  literal production `CONNECTOR_ID` against the process-global mock
  keyring, so parallel `cargo test` execution occasionally let one test's
  vault write leak into the other's "no vault write" assertion — fixed
  with a `Mutex<()>` serializing just those two tests. Verified: `cargo
  fmt`/`clippy`/`test --lib` (70/70) clean; `tsc`/`eslint`/`prettier`
  clean; real Vite dev server confirmed the provider toggle swaps fields
  correctly with mobile-mirrored copy; real debug binary build +
  `launch-smoke.js`. **Honest gap, narrower than most:** the native-window
  click-through wasn't driven by hand (same sandbox limitation as every
  desktop UI task since 12.5), but unlike a typical frontend-only task,
  the real save/validate/vault/grant logic is covered by real Rust tests
  against the actual production code path, not just typechecking.
- **Cancel an in-flight model download (13.7).** Closed the stated gap
  13.2 shipped with. `download.rs`'s `DownloadOptions.cancel:
  Option<CancellationToken>` was already fully wired (checked every loop
  iteration, already deleted the partial `.part` file on cancel) — the
  only real gap was that no caller ever constructed a token. `AppState`
  gained `downloads: Mutex<HashMap<String, CancellationToken>>` (keyed by
  model id, mirroring mobile's `Map<string, AbortController>`);
  `install_model` stashes a token before downloading and removes it once
  the download settles either way; new command `cancel_install(id)` trips
  it if present. `ModelsScreen.tsx`'s downloading/verifying rows are now
  clickable (`CANCEL` accessory, `tap to cancel` subtitle), and a
  cancelled install drops its row rather than showing a failure —
  `TauriCommandError` gained a `code` field (from `ModelError`'s own
  kebab-case `code`) so the frontend can tell a deliberate cancel apart
  from a real one. **A real gap this task's review caught, beyond its own
  scope:** `download.rs` had zero tests before this task despite being
  one of the more failure-prone modules in the app — added two real,
  unmocked tests (hand-rolled local `TcpListener` server, same pattern
  `tests/connector_dispatch.rs` uses) proving a precancelled token and a
  mid-stream cancel both actually stop the transfer and delete the
  partial file, not just trusting the cleanup branch by reading it.
  Verified: `cargo fmt`/`clippy`/`test --lib` (72/72) clean;
  `tsc`/`eslint`/`prettier` clean; real Vite dev server (scratch-seeded
  row, reverted before commit, confirmed via `git diff`) showed the
  `CANCEL` label/copy and the click firing `cancelInstall` with no
  console errors; real debug binary build + `launch-smoke.js`. **Honest
  gap, narrower than most:** the real native-window click-through (cancel
  an actual multi-GB download, confirm the `.part` file is gone) can't be
  driven in this sandbox, but the actual cancellation mechanics are
  proven by real, unmocked tests against the real code path — only the
  thin UI-to-IPC glue is unverified here.
- **Frontend test coverage (13.8).** Closed desktop's biggest gap from a
  fresh feature audit: zero frontend tests existed anywhere before this.
  Vitest, not Jest — desktop already runs on Vite, reusing it is the
  "don't add a dependency this app doesn't need" call, not a Jest
  preference. `vite.config.ts` gained a `test` block (`jsdom`,
  `globals: false`); `src/test/setup.ts` wires Testing Library's
  `cleanup()` by hand plus two jsdom polyfills found only by running the
  suite (`window.matchMedia`, `Element.prototype.scrollTo` — both called
  unconditionally by existing components, both entirely absent from
  jsdom). 37 tests across `ModelsScreen`/`ConnectorsScreen`/
  `SearchSetupScreen`/`SettingsScreen`/`ChatScreen`/`ModeBar`/`modes.ts`,
  each asserting on the real mocked Tauri call and its arguments (e.g.
  `ChatScreen`'s per-mode `connector_mode` derivation, `ModelsScreen`'s
  task-13.7 cancelled-vs-real-failure branch), not just that a component
  renders. **A real, non-obvious fix:** root `ci.yml`'s `pnpm test --ci`
  forwards `--ci` to every workspace package's own `test` script via
  `pnpm -r --if-present` — confirmed by actually running it, not
  assumed — and Vitest's CLI rejects unknown flags outright, so a bare
  `vitest run` would have broken CI the moment this task's own script
  existed. Fixed with `"test": "sh -c 'vitest run'"`: `sh -c` runs the
  quoted command as its own invocation, so anything appended after it
  (`--ci`) becomes the subshell's own positional parameters, never
  reaching Vitest's argv. No `desktop.yml` change needed — that workflow
  only builds/launches the native binary; the shared `ci.yml` step
  already fans out `--if-present` to every package. Verified: `pnpm test`
  (37/37) and root `pnpm test --ci` (mobile 241/241 + desktop 37/37, the
  literal CI invocation) both clean; `typecheck`/`eslint`/`prettier`
  clean. No Rust touched.
- **Static offline-boundary import-graph check (13.9).**
  `scripts/ci/check-offline-boundary.js` — a direct port of mobile's own
  `check-offline-boundary.js` (same BFS-shortest-chain algorithm, same
  `ts.preProcessFile`-based import reading), converted to ESM (this
  package is `"type": "module"`, mobile's is not) and re-pointed at
  desktop's real boundary: `src/chat/` reaches the network only through
  `src/lib/tauri.ts`'s `invoke()` into the Rust backend (already guarded
  at runtime by task 12.9's `net_guard.rs`), so the check's job is
  narrower than mobile's — stop `src/chat/` from importing
  `src/models/`/`src/connectors/` directly, and catch a frontend HTTP
  client package if one is ever added. Root `package.json`'s
  `check:offline` script changed from mobile-only
  (`pnpm --filter mobile check:offline`) to `pnpm -r --if-present
  check:offline`, matching the existing `lint`/`typecheck`/`test`
  fan-out — no `ci.yml` change needed, its step already just calls
  `pnpm check:offline`. Verified: real, unmodified `src/chat/` tree
  passes (`3 files ... intact`); a scratch-planted violation (a
  throwaway import from `models/ModelsScreen.tsx` appended to
  `modes.ts`) was confirmed to report the exact import chain and exit
  non-zero, then reverted before committing (`git diff` confirmed clean).
  `typecheck`/`eslint`/`prettier` clean.
- **No-hardcoded-color ESLint rule (13.10).** `eslint.config.js` gained a
  `no-restricted-syntax` rule banning `#hex`/`rgb()`/`rgba()`/`hsl()`/
  `hsla()` literals under `src/**` (test files excluded) — the same
  regex mobile's own equivalent rule uses. No exemption directory
  needed, unlike mobile's `src/design-system/` exemption: `packages/
  design-tokens` (where color values legitimately live) sits outside
  `apps/desktop/`'s own tree, so `eslint .` run here never reaches it.
  Verified: clean on the real, unmodified tree; a scratch-planted
  literal (`'#ff0000'` in `modes.ts`) was confirmed to fire the rule with
  the right message, then reverted before committing.
- **Real installer artifacts per platform (14.1).**
  `tauri.conf.json`'s `bundle.targets` names each platform explicitly
  (`["app", "dmg", "nsis", "deb", "appimage"]`, `rpm` deliberately cut) —
  replacing the bare `"all"` default. `apps/desktop/src-tauri/
  .cargo/config.toml` (new) pins `MACOSX_DEPLOYMENT_TARGET = "11.0"`: a
  real release build (the first one this repo ever ran — every prior task
  only ran `cargo build`'s debug profile) failed twice on this machine —
  `cmake` wasn't installed at all, and once it was, `llama-cpp-sys-2`'s
  vendored `llama.cpp` doesn't compile against its own default deployment
  target (10.13; Apple's SDK marks `std::filesystem::path` unavailable
  before 10.15). A plain shell `export` fixed a direct `cargo build
  --release` but was found not to reliably reach the `cmake` invocation
  `pnpm tauri build` spawns through its own subprocess chain — the
  `.cargo/config.toml` `[env]` table is what actually made the fix durable
  across every invocation shape. Verified from a clean shell with no
  exported variable: `pnpm tauri build` produced a real `.app` and `.dmg`;
  the `.app` was copied to `~/Desktop` (confirmed via the running
  process's own path in `ps aux`, not just build success) and launched for
  real, and the `.dmg` was mounted with `hdiutil` and confirmed to contain
  the standard drag-to-install layout. Linux artifacts closed the same way,
  after the fact: `apps/desktop/docker/linux-build.Dockerfile` builds a
  Debian bookworm image with Tauri's Linux prerequisites plus `cmake`/
  `clang`/`libclang-dev` (the latter two for `llama-cpp-sys-2`'s `bindgen`
  step — not part of Tauri's own prerequisite list), and runs a real,
  native (not cross-compiled) `pnpm --filter desktop exec tauri build`
  inside a container — producing `Sovereign Edge_0.0.0_arm64.deb` and
  `Sovereign Edge_0.0.0_aarch64.AppImage` (arm64, Docker Desktop's default
  container arch on this Apple Silicon host, not x86_64). Verified for
  real: `dpkg --info`/`--contents` confirm sane package metadata and
  layout; `dpkg-deb -x` + `ldd` confirmed every shared library resolves
  cleanly; running the extracted binary under `xvfb-run` (a real virtual X
  server) and checking `ps aux` after several seconds confirmed the
  process genuinely stays alive, not just "the build exited 0" — a plain
  headless run (no display) reaches GTK init and fails there with a clear
  panic, not a linker error, itself further evidence the binary is sound.
  This native container build writes into the same
  `apps/desktop/src-tauri/target/release/` path the macOS build uses, so
  running it leaves the host's own `target/release` holding a Linux ELF
  binary until a macOS `pnpm tauri build`/`cargo build --release` runs
  again on the host — do this before trusting `target/release` for local
  macOS work if you've run the Linux container. **Windows gap closed by
  task 14.4, not here:** a real `nsis` `.exe` needed an actual Windows
  host or CI runner — infeasible on this machine (Docker Desktop can't run
  Windows containers on macOS, no MSVC cross-toolchain) — which 14.4's
  `windows-latest` GitHub Actions runner now provides for real.
- **Icons are real, not placeholders** — generated via `pnpm tauri icon`
  from `apps/mobile/assets/icon.png`, so the desktop and mobile apps share
  one visual identity rather than diverging from day one.
- **Update mechanism (14.3).** `tauri-plugin-updater` + `tauri-plugin-process`
  (the latter only for `relaunch()`) registered in `lib.rs` — the first
  `.plugin(...)` calls in this codebase.
  `capabilities/default.json`: `updater:allow-check`,
  `updater:allow-download-and-install`, `process:allow-restart` (not
  `allow-relaunch` — `@tauri-apps/plugin-process`'s `relaunch()` invokes
  the plugin's own `restart` command internally, confirmed by reading its
  JS source). `tauri.conf.json`'s `bundle.createUpdaterArtifacts: true` is
  required for `pnpm tauri build` to emit the signed `.app.tar.gz`/`.sig`
  the updater fetches — without it, `tauri build` silently produces no
  updater artifacts at all (found by running a real build, not assumed).
  A real Ed25519 keypair lives outside the repo at
  `~/.tauri/sovereign-edge-updater.key`; the public half is embedded in
  `tauri.conf.json`, the private half supplied at build time via
  `TAURI_SIGNING_PRIVATE_KEY` (**consequence**: `pnpm tauri build` now
  fails non-zero without that env var set, once a pubkey is configured —
  expected Tauri behavior, worth knowing before a full release build).
  Hosting: GitHub Releases, via the `releases/latest/download/latest.json`
  alias — any future tagged release with a `latest.json` asset becomes the
  update source automatically. `SettingsScreen.tsx`'s "About" section
  gained a manual "Check for Updates" button (not polled on launch),
  matching this app's explicit-user-action posture for network calls.
  **Verified**: a real signed `0.0.1` build, a real (throwaway, deleted)
  GitHub prerelease, real public HTTPS asset resolution, and a real
  cryptographic signature check (`minisign-verify`, the same crate
  `tauri-plugin-updater` itself uses) confirming the hosted artifact's
  `.sig` verifies against the pubkey — with a tampered-byte negative
  control confirmed to fail. **Honest gap, this task's own session:** the
  sandboxed environment doing the implementation work had no Accessibility/
  screen-capture access, so the actual native-window click-through (check
  → download → install → relaunch → confirm new version) couldn't be
  driven interactively there. Task 14.4 closed the gap that mattered more:
  a real, live production release (`v0.1.5`) now exists, so this can be
  verified by hand on any real machine going forward. Proceeded
  deliberately without task 14.2 (code signing) — the two signing schemes
  are independent; updates to this still-unsigned app trigger the same
  Gatekeeper warning a fresh install does.
- **Release pipeline (14.4).** `.github/workflows/desktop-release.yml`
  (new): `workflow_dispatch` with a `version` input, mirroring mobile's
  own `release.yml` convention (no tag-push trigger exists in this repo).
  `prepare` job bumps the three version fields via the new
  `apps/desktop/scripts/bump-version.mjs`, commits, tags
  `desktop-v$VERSION`, pushes — a real, permanent bump each run, not
  scratch-and-revert. `build` job (matrix macOS/Windows/Linux, mirroring
  `desktop.yml`) uses `tauri-apps/tauri-action@v0` to build, sign, and
  publish to one shared GitHub Release across all three legs, generating
  `latest.json` itself. `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD` are real
  GitHub Actions secrets now (the same key task 14.3 generated), not just
  a local file. **Three real bugs found by actually running this
  pipeline, not by reading the YAML:** (1) a full workspace `pnpm install`
  breaks on Windows via mobile's `llama.rn` postinstall — fixed by scoping
  to `--filter desktop...` (also fixed in `desktop.yml`, which had been
  silently red on Windows for a while for the same reason); (2) Cargo's
  config-file discovery walks up from CWD, never down, so
  `src-tauri/.cargo/config.toml` was invisible to `tauri-apps/tauri-action`
  (which builds from `apps/desktop`) — relocated to
  `apps/desktop/.cargo/config.toml`; (3) relocating alone wasn't enough —
  Cargo's `[env]` table doesn't override an already-set env var without
  `force = true`, and something in the Tauri CLI's own build chain
  (probably `bundle.macOS.minimumSystemVersion` defaulting to `10.13`) was
  setting `MACOSX_DEPLOYMENT_TARGET` itself before `cargo build` ran —
  fixed with `{ value = "11.0", force = true }`, verified locally by
  reproducing the exact conflict. **`v0.1.5` is published** — real signed
  macOS/Windows/Linux artifacts, cryptographically verified, and the
  production updater endpoint now resolves to it for real.

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
├── src/            # React DOM frontend — shell/AppShell.tsx (nav), chat/,
│                     # models/, connectors/, settings/ (screens), lib/tauri.ts
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
