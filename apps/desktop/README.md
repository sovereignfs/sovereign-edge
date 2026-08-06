# `apps/desktop`

Placeholder — this is workspace scaffolding, not a working app yet.

Blocked on epic 9.1 (desktop shell technology spike —
`docs/epics/desktop/desktop-app.md`): Tauri vs. Electron vs. a React Native desktop
renderer, weighed against native `llama.cpp` binding options (`llama.rn`
does not run outside React Native — desktop needs `node-llama-cpp` or a Rust
binding depending on the shell chosen), Tier 3 OS integration surface, and
now also how much of `packages/mobile-ui` / `packages/design-tokens` a given
choice lets this app reuse.

Once 9.1 resolves, this app supplies its own implementations of the
adapter interfaces defined in `packages/core` (once that extraction happens
too): an `EngineAdapter` for whatever `llama.cpp` binding fits the chosen
shell, a `SecureStorageAdapter` over the platform's OS keychain (macOS
Keychain / Windows Credential Manager / Linux Secret Service), and its own
Tier 3 native-handler registry — the same pattern `apps/mobile` already
follows for `expo-secure-store` and `expo-calendar`/`expo-camera`.

Not related to the `sovereign-desktop` repo in the wider `sovereignfs`
ecosystem — that's a Tauri WebView shell around a self-hosted `sovereign`
instance, a different product entirely.
