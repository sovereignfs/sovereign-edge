//! `SecureStorageAdapter` (task 12.3), mirroring
//! `apps/mobile/src/connectors/permissions/vault.ts`.
//!
//! Not a separate Tauri *plugin* crate despite `core-port.md`'s "Tauri
//! plugin" phrasing: mobile's `openVault` is never called from UI code
//! either — its only caller is `connectors/runtime/execute.ts`, internal
//! Rust-side business logic (task 12.4's connector runtime), never IPC from
//! the WebView. A plain module needs no command/capability surface.

pub mod vault;

pub use vault::{open_vault, ConnectorVault, VaultError};
