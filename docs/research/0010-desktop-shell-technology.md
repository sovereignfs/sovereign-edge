---
id: 10
title: "Desktop shell technology: Tauri vs. Electron vs. React Native desktop"
status: decided
date: "August 2026"
author: "Claude Code (session with the developer)"
scope: desktop
summary: "Epic 9.1's spike — which shell desktop builds on, weighed against native llama.cpp bindings, Tier 3 OS integration, and install size"
---

# Research 0010 — Desktop shell technology

**Related:** [Epic 9 — Desktop Shell](../epics/desktop/shell.md) (task 9.1,
this doc's own subject), [Epic 12 — Desktop Core Port](../epics/desktop/core-port.md)
(depends on the decision here), [research 0001](0001-concept-and-connector-architecture.md#open-questions)
(first flagged this as an open question), [research 0002](0002-react-native-framework-choice.md)
(the mobile equivalent of this decision, same shape of question one layer
down the stack)

---

## Note on sequencing

`ROADMAP.md`'s Desktop section and epic 9.1 itself both gate this on "Mobile
MVP (Phase 1) shipped." Phase 1 is functionally complete — chat, model
manager, and the Search connector all ship — but task 0.1.20 (store release
setup) is still open. This spike was deliberately pulled forward ahead of
that one packaging/submission task, on the developer's explicit instruction,
because it answers an architecture question (which native `llama.cpp`
binding, which package layout) that has no bearing on whether the mobile
store listing is live. **Epic 12 (the actual desktop port) still is not
started** — this doc and epic 9.1's status are the only things moving early.

## Question

Which shell technology does `apps/desktop` build on? The three candidates on
the table since research 0001: Tauri, Electron, or a React Native desktop
renderer (`react-native-macos` / `react-native-windows`, reusing
`apps/mobile`'s own framework). Decided against this project's specific
needs, not shell technology in the abstract:

1. A working path to run `llama.cpp` GGUF inference on the desktop, since
   `llama.rn` (`apps/mobile`'s binding) is mobile-only.
2. A Tier 3 native-OS-integration story as strong as the permission model
   `apps/mobile` already ships (per-capability grants, revocable, enforced
   structurally — see [connector-framework.md](../epics/mobile/connector-framework.md)
   task 2.6).
3. Install size — this product's whole pitch is a lean, trustworthy local
   companion, not another Electron-sized download.
4. How much of `packages/mobile-ui` / `packages/design-tokens` a choice lets
   this app reuse, per both packages' own READMEs.

## Findings

**`llama.rn` does not run outside React Native, and does not extend to
`react-native-macos`/`react-native-windows` today.** Its own repository
documents iOS and Android only — no mention of macOS or Windows, no
`react-native-macos`/`-windows` compatibility notes. Worse, `llama.rn` v0.10+
hard-requires React Native's New Architecture (Fabric/TurboModules); the
out-of-tree Windows and macOS platforms have historically lagged core React
Native's New Architecture rollout by a wide margin, and there is no evidence
either has caught up enough to run `llama.rn` unmodified. Picking RN-desktop
would not mean reusing `llama.rn` — it would mean writing a brand-new native
`llama.cpp` binding per desktop OS from scratch, on a platform (`react-native-windows`
in particular) with a materially smaller contributor base than either Tauri
or Electron to lean on when that binding breaks.

**Electron has a real, actively-maintained `llama.cpp` binding.**
[`node-llama-cpp`](https://github.com/withcatai/node-llama-cpp) wraps
`llama.cpp` for Node, is used in shipped Electron apps today (demonstrated in
public examples), and had community activity as recent as this year. Bundle
size is the well-known tradeoff: Electron installers commonly run 50–150MB+
because every app ships its own Chromium and Node runtime, regardless of
what the app itself needs.

**Tauri has an equally real path via Rust bindings** (`llama-cpp-2`,
`llama_cpp-rs`), demonstrated in multiple shipped and in-progress projects
running `llama.cpp`/GGUF models fully on-device through a Tauri shell. Tauri
uses the OS's own WebView instead of bundling a browser engine, so typical
app sizes land in the 3–15MB range — roughly an order of magnitude smaller
than Electron's — with correspondingly lower idle memory use. Tauri v2 has
been stable since October 2024.

**Tauri v2's security model is a closer structural match to this project's
own.** It replaced Tauri 1's allowlist with a default-deny **capabilities /
permissions / scopes** system: every window's access to native commands is
explicitly granted per capability, nothing is reachable by default. That is
the same shape `apps/mobile`'s connector framework already enforces —
per-connector, per-capability, revocable, denied unless explicitly granted
(see `permissions/grants.ts`'s `isAllowed()` and task 2.6's generalized
granted-scope concept). Electron's main process has full Node access by
default; matching Tauri's default-deny posture there is possible but is
discipline the developer has to maintain, not something the shell enforces
structurally — the same "cannot, not should not" distinction this repo's own
`ConnectorVault` design already leans on elsewhere.

**Skillset cost is real and goes the other way.** Tauri's backend is Rust.
Nothing in this repo is Rust today; the mobile app and its tooling are
TypeScript/Swift/Kotlin (via Expo modules). Electron would let the existing
TypeScript skillset carry over directly, with `node-llama-cpp` as a same-language
dependency rather than a new one. This is the strongest point in Electron's
favor and the main cost on Tauri's side of the ledger.

**Package reuse is a wash, not a tiebreaker.** Neither Tauri nor Electron
lets `apps/desktop` consume `packages/mobile-ui` directly — both render a web
frontend (React DOM or similar), not React Native primitives. Either choice
means `packages/desktop-ui` gets real content, built against
`packages/design-tokens`, exactly the second branch both packages' READMEs
already anticipated. Only RN-desktop would have avoided this, and RN-desktop
is ruled out on the inference-binding finding above regardless.

## Options considered

**A. Tauri.** Smallest install size and lowest idle memory by a wide margin;
default-deny capability model matches this project's existing trust
architecture; real Rust `llama.cpp` bindings exist and are used in shipped
apps. Cost: Rust is a new language for this codebase, and Tauri's tooling/
ecosystem, while stable, is smaller than Electron's. **Recommended.**

**B. Electron.** No new language — the existing TypeScript skillset carries
over directly; `node-llama-cpp` is mature and actively maintained; by far the
largest packaging/signing/auto-update ecosystem. Cost: 50–150MB+ installs and
proportionally higher memory use work against this product's own "lean,
trustworthy local companion" pitch, and matching Tauri's default-deny
security posture takes deliberate main-process discipline rather than a
shell-enforced default.

**C. React Native desktop** (`react-native-macos` / `react-native-windows`).
Would in principle let `apps/desktop` consume `packages/mobile-ui` (or even
`apps/mobile/src/design-system/`) directly, and keep the whole codebase in
one framework. Ruled out: `llama.rn` has no desktop support today and no
signaled path to it, `react-native-windows`'s New Architecture support lags
enough to make the New-Architecture-only `llama.rn` v0.10+ a further risk
even if a binding existed, and the actual engineering lift — writing a new
native `llama.cpp` binding per OS — is the same order of effort Tauri
requires, without Tauri's install-size or security-model advantages to show
for it.

## Recommendation

**Tauri v2.** It wins on two of this doc's four stated criteria outright
(install size, Tier 3 security-model fit), ties on the third (a real,
maintained `llama.cpp` binding exists, same as Electron), and only RN-desktop
— already ruled out — would have won the fourth (package reuse). The Rust
skillset cost is real but bounded: the surface Rust actually needs to cover
(an `EngineAdapter` around a `llama.cpp` binding, a `SecureStorageAdapter`
over each OS's credential store, a Tier 3 native-handler registry) is small
and mirrors `apps/mobile/src/models/`, `permissions/vault.ts`, and
`nativeHandlers.ts` closely enough to port by pattern rather than design from
scratch.

## Decisions

- **Shell: Tauri v2.** `apps/desktop` builds its UI as a web frontend (React
  DOM) inside a Tauri shell, not Electron and not `react-native-macos`/`-windows`.
- **Inference:** a Rust `llama.cpp` binding (`llama-cpp-2` or equivalent,
  final crate choice deferred to task 12.2's implementation) behind an
  `EngineAdapter`, mirroring `apps/mobile/src/chat/inference`'s own adapter
  shape once `packages/core`'s extraction happens.
- **Credentials:** a `SecureStorageAdapter` over the OS's own credential
  store — macOS Keychain, Windows Credential Manager, Linux Secret Service —
  via a Tauri plugin, mirroring `permissions/vault.ts`'s per-connector
  namespacing (task 12.3's job to implement, not this doc's).
- **Tier 3 native handlers:** Tauri commands gated by its own capabilities
  system, registered the same "manifest names a capability, runtime looks it
  up" way `apps/mobile/src/connectors/runtime/nativeHandlers.ts` already
  does — the manifest schema and permission model (task 2.6) carry over
  unchanged, only the native-handler registry's implementation differs per
  platform.
- **`packages/desktop-ui` is now real work**, not a maybe: it needs a
  component set matching `apps/mobile/src/design-system`'s (`ThemeProvider`,
  `Button`, `ChatBubble`, `ListItem`, `TextField`, `Toggle`) built against
  `packages/design-tokens`, for React DOM rather than React Native
  primitives. `packages/mobile-ui` is unaffected — still not worth
  populating, since desktop cannot consume it regardless.

## Open questions

- Final Rust `llama.cpp` crate choice (`llama-cpp-2` vs. `llama_cpp-rs` vs.
  shelling out to a bundled `llama-server` binary, as some surveyed projects
  do) — task 12.2's implementation decision, not this doc's to settle.
- Auto-update story: Tauri has a first-party updater plugin, but this
  product's own model — direct sale, no store review gate — means the update
  mechanism and code-signing/notarization requirements need their own pass
  before task 12.1 (build tooling) or any later release-packaging task ships
  anything.
- WebView rendering parity across macOS (WebKit), Windows (WebView2), and
  Linux (WebKitGTK) for the specific `packages/design-tokens` output — not
  measured here; task 12.6's own review checklist is where this gets
  checked, not assumed.

## Next steps

Epic 9 (Desktop Shell) is done — recorded here. Epic 12 (Desktop Core Port,
now broken into tasks 12.1–12.7 — see
[core-port.md](../epics/desktop/core-port.md)) can now start in principle,
but per the note on sequencing above, this repo's own convention is still
"one task at a time, sequenced" — whether 12.1 actually starts next, or waits
for task 0.1.20 to close out Phase 1 properly first, is a scheduling call for
whoever picks this up next, not a technical blocker this doc leaves behind.
