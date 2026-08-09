//! Store-installed connector manifests (task 5.5), mirroring
//! `apps/mobile/src/connectors/store/installed.ts`.
//!
//! Before this, "which connectors does this device have" was never a real,
//! persisted concept on desktop — `known_connector_manifests()` in `lib.rs`
//! was hardcoded to Search alone. A registry-installed connector has no
//! build-it-from-config path (it's arbitrary third-party data), so its
//! manifest is persisted verbatim once installed, keyed by id so
//! re-installing the same connector overwrites rather than duplicates.
//!
//! Stored as raw `serde_json::Value` rather than a typed `ConnectorManifest`
//! — that enum has no derived `Deserialize` of its own (see its own doc
//! comment: a hand-rolled two-step parse, not a serde-tagged enum) — and
//! re-validated through `validate_manifest` on every read, the same
//! fail-closed discipline `permissions::grants`'s `read_all` already
//! applies to a corrupt grants file: a manifest that no longer validates
//! reads as "not installed," not as a stale value trusted anyway.

use super::manifest::{validate_manifest, ConnectorManifest, ValidationResult};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const INSTALLED_FILENAME: &str = "installed.json";

fn installed_file(connectors_dir: &Path) -> PathBuf {
    connectors_dir.join(INSTALLED_FILENAME)
}

type InstalledRecord = HashMap<String, serde_json::Value>;

/// Fails closed, same as `grants.rs`'s `read_all`: a corrupt or missing
/// file reads as nothing installed, never as stale entries the app can no
/// longer account for.
fn read_all(connectors_dir: &Path) -> InstalledRecord {
    let Ok(text) = std::fs::read_to_string(installed_file(connectors_dir)) else {
        return InstalledRecord::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_all(connectors_dir: &Path, record: &InstalledRecord) {
    // Losing a write here costs one missing connector on next launch,
    // which the user can reinstall — same tolerance `grants.rs`'s own
    // `write_all` applies to its best-effort writes.
    if std::fs::create_dir_all(connectors_dir).is_err() {
        return;
    }
    if let Ok(json) = serde_json::to_string_pretty(record) {
        let _ = std::fs::write(installed_file(connectors_dir), json);
    }
}

pub fn read_installed(connectors_dir: &Path) -> Vec<ConnectorManifest> {
    read_all(connectors_dir)
        .into_values()
        .filter_map(|value| match validate_manifest(&value) {
            ValidationResult::Valid(manifest) => Some(*manifest),
            ValidationResult::Invalid(_) => None,
        })
        .collect()
}

/// Persists a manifest that has already been validated by the caller
/// (`install_connector` in `lib.rs`) — this function re-validates on every
/// *read* (see `read_installed`), not on write, so it stores exactly what
/// was handed to it rather than silently dropping a write whose manifest
/// happens not to carry an `id` field (which `validate_manifest` would
/// already have rejected upstream).
pub fn save_installed(connectors_dir: &Path, id: &str, manifest_json: &serde_json::Value) {
    let mut record = read_all(connectors_dir);
    record.insert(id.to_string(), manifest_json.clone());
    write_all(connectors_dir, &record);
}

pub fn remove_installed(connectors_dir: &Path, connector_id: &str) {
    let mut record = read_all(connectors_dir);
    record.remove(connector_id);
    write_all(connectors_dir, &record);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_suffix() -> String {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("{}-{n}", std::process::id())
    }

    fn scratch_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-installed-test-{}",
            unique_suffix()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn manifest_json(id: &str) -> serde_json::Value {
        serde_json::json!({
            "manifestVersion": 1,
            "id": id,
            "name": "Test Connector",
            "version": "1.0.0",
            "summary": "A test fixture.",
            "tier": 1,
            "platforms": ["desktop"],
            "tool": {
                "name": "test_tool",
                "description": "A test tool.",
                "parameters": { "type": "object", "properties": {} }
            },
            "permissions": { "network": { "origins": ["https://api.example.org"] } },
            "request": {
                "method": "GET",
                "origin": "https://api.example.org",
                "path": [{ "literal": "x" }]
            },
            "response": { "textFrom": "x", "maxBytes": 1000 },
            "pricing": { "model": "free" }
        })
    }

    #[test]
    fn reads_an_empty_list_when_nothing_has_been_installed() {
        let dir = scratch_dir();
        assert!(read_installed(&dir).is_empty());
    }

    #[test]
    fn round_trips_a_saved_connector() {
        let dir = scratch_dir();
        save_installed(
            &dir,
            "fs.sovereign.test",
            &manifest_json("fs.sovereign.test"),
        );

        let installed = read_installed(&dir);
        assert_eq!(installed.len(), 1);
        assert_eq!(installed[0].id(), "fs.sovereign.test");
    }

    #[test]
    fn overwrites_rather_than_duplicates_on_reinstall_of_the_same_id() {
        let dir = scratch_dir();
        save_installed(
            &dir,
            "fs.sovereign.test",
            &manifest_json("fs.sovereign.test"),
        );
        let mut updated = manifest_json("fs.sovereign.test");
        updated["version"] = serde_json::json!("2.0.0");
        save_installed(&dir, "fs.sovereign.test", &updated);

        let installed = read_installed(&dir);
        assert_eq!(installed.len(), 1);
    }

    #[test]
    fn keeps_multiple_distinct_connectors() {
        let dir = scratch_dir();
        save_installed(&dir, "fs.sovereign.one", &manifest_json("fs.sovereign.one"));
        save_installed(&dir, "fs.sovereign.two", &manifest_json("fs.sovereign.two"));

        assert_eq!(read_installed(&dir).len(), 2);
    }

    #[test]
    fn removes_a_connector_by_id() {
        let dir = scratch_dir();
        save_installed(
            &dir,
            "fs.sovereign.test",
            &manifest_json("fs.sovereign.test"),
        );
        remove_installed(&dir, "fs.sovereign.test");

        assert!(read_installed(&dir).is_empty());
    }

    #[test]
    fn removing_an_id_that_was_never_installed_is_a_noop() {
        let dir = scratch_dir();
        save_installed(
            &dir,
            "fs.sovereign.test",
            &manifest_json("fs.sovereign.test"),
        );
        remove_installed(&dir, "fs.sovereign.never-installed");

        assert_eq!(read_installed(&dir).len(), 1);
    }

    #[test]
    fn fails_closed_on_corrupt_state_rather_than_panicking() {
        let dir = scratch_dir();
        save_installed(
            &dir,
            "fs.sovereign.test",
            &manifest_json("fs.sovereign.test"),
        );
        std::fs::write(installed_file(&dir), "{ not json").unwrap();

        assert!(read_installed(&dir).is_empty());
    }

    #[test]
    fn drops_an_entry_that_no_longer_validates_rather_than_trusting_it() {
        let dir = scratch_dir();
        let mut invalid = manifest_json("fs.sovereign.test");
        // request.origin no longer in permissions.network.origins.
        invalid["request"]["origin"] = serde_json::json!("https://different.example.org");
        save_installed(&dir, "fs.sovereign.test", &invalid);

        assert!(read_installed(&dir).is_empty());
    }
}
