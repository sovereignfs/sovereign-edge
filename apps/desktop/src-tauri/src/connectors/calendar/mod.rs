//! The Calendar connector (task 10.2), macOS only via real Apple EventKit
//! bindings (`objc2-event-kit`) — mirrors
//! `apps/mobile/src/connectors/calendar/`, but only on the one desktop OS
//! this environment can build and verify. Windows' equivalent API
//! (`Windows.ApplicationModel.Appointments`) requires package identity this
//! app's unpackaged NSIS/MSI distribution doesn't have, and Linux has no
//! single calendar API — GNOME's evolution-data-server and KDE's Akonadi
//! are structurally different D-Bus protocols. See
//! `docs/research/0011-desktop-calendar-connector.md` for the full findings
//! behind that scope decision.
//!
//! `calendar_manifests()` and `request_access()` exist on every platform
//! (the frontend and `lib.rs` call them unconditionally) but are empty/
//! always-false stubs off macOS — the connector simply isn't offered
//! there, not represented as a runtime error.

#[cfg(target_os = "macos")]
mod access;
#[cfg(target_os = "macos")]
mod handlers;
#[cfg(target_os = "macos")]
mod manifest;

#[cfg(target_os = "macos")]
pub use access::request_access;
#[cfg(target_os = "macos")]
pub use handlers::native_handler_for;
#[cfg(target_os = "macos")]
pub use manifest::calendar_manifests;

#[cfg(not(target_os = "macos"))]
pub fn calendar_manifests() -> Vec<crate::connectors::manifest::ConnectorManifest> {
    Vec::new()
}

#[cfg(not(target_os = "macos"))]
pub async fn request_access() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub fn native_handler_for(_capability: &str) -> Option<crate::connectors::runtime::NativeHandler> {
    None
}
