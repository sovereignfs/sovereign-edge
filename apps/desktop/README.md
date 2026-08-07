# `apps/desktop`

An empty Tauri window — real scaffolding, not a working app yet. Task 12.1
(Tauri app scaffold and build tooling) is done; nothing past that has
shipped. See [AGENTS.md](AGENTS.md) for the full state of play.

Epic 9 (Desktop Shell — `docs/epics/desktop/shell.md`) is resolved: **Tauri
v2**, over Electron and a React Native desktop renderer
(`react-native-macos`/`-windows`). Full reasoning in
[research 0010](../../docs/research/0010-desktop-shell-technology.md) — in
short, `llama.rn` (the mobile inference binding) has no macOS/Windows
support, and Tauri beats Electron on install size and on a default-deny
capabilities model that matches this project's existing per-connector
permission architecture more closely than Electron's.

Epic 12 (Desktop Core Port — `docs/epics/desktop/core-port.md`; the actual
desktop port, broken into tasks 12.1–12.7) has task 12.1 done; the rest has
not started. Task 12.2 onward will supply this app's own implementations of
the adapter interfaces defined in `packages/core` (once that extraction
happens too): an `EngineAdapter` around a Rust `llama.cpp` binding
(`llama-cpp-2` or equivalent — final crate choice is task 12.2's to make), a
`SecureStorageAdapter` over the platform's OS keychain (macOS Keychain /
Windows Credential Manager / Linux Secret Service) via a Tauri plugin, and
its own Tier 3 native-handler registry gated by Tauri's own capabilities
system — the same pattern `apps/mobile` already follows for
`expo-secure-store` and `expo-calendar`/`expo-camera`, just implemented in
Rust behind Tauri commands instead of Expo modules.

The UI is a React DOM frontend against `packages/desktop-ui` (now real,
non-speculative work — see that package's own README) and
`packages/design-tokens`, not a consumer of `packages/mobile-ui`: Tauri
renders a web frontend, not React Native primitives.

Not related to the `sovereign-desktop` repo in the wider `sovereignfs`
ecosystem — that's a Tauri WebView shell around a self-hosted `sovereign`
instance, a different product entirely.
