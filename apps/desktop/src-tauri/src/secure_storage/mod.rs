//! `SecureStorageAdapter` (task 12.3), mirroring
//! `apps/mobile/src/connectors/permissions/vault.ts`.
//!
//! Not a separate Tauri *plugin* crate despite `core-port.md`'s "Tauri
//! plugin" phrasing: a plain module needs no command/capability surface of
//! its own — callers that need one wire it individually. Originally
//! (tasks 12.3/12.4) that meant "no caller from UI code at all," mirroring
//! mobile's `openVault`, whose only caller was `connectors/runtime/
//! execute.ts`, internal business logic never reached from IPC. Task 13.6
//! is the first exception: `set_search_connector_config` is a real Tauri
//! command that calls `open_vault(...).write(...)` directly, to persist a
//! user-entered Tavily API key from the Search setup screen — this module
//! itself is unchanged, only who's allowed to call it.

pub mod vault;

pub use vault::{open_vault, ConnectorVault, VaultError};
