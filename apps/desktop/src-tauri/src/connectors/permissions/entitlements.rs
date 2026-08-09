//! The platform-agnostic notion of "this connector is unlocked for this
//! user," independent of which purchase rail granted it (task 6.1),
//! mirroring `apps/mobile/src/connectors/permissions/entitlements.ts`.
//!
//! Deliberately a plain local record, not a signed token: research 0001
//! points at `sovereign`'s own signed-entitlement model (RFC 0003 in that
//! repo) as the concept to mirror, but there is no real issuer to sign
//! against yet — task 6.2 (mobile IAP) and 6.3 (desktop direct sale), the
//! only things that would ever produce a real purchase receipt, don't
//! exist. `source` is an opaque string a real caller will pass
//! (`"desktop-direct"` once 6.3 lands); nothing here inspects it.
//!
//! Same plain-JSON file shape `permissions::grants` and `installed.rs`
//! already use, taking `connectors_dir: &Path` directly the way
//! `installed.rs` does (no extra subdirectory), and living beside
//! `grants.rs` rather than in `installed.rs`'s module: both grants and
//! entitlements answer "may this connector run," for consent and payment
//! respectively — `installed.rs` answers "which manifests does this
//! device have" instead.

use crate::connectors::manifest::ConnectorManifest;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const ENTITLEMENTS_FILENAME: &str = "entitlements.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementRecord {
    pub connector_id: String,
    pub granted_at: String,
    pub source: String,
}

fn entitlements_file(connectors_dir: &Path) -> PathBuf {
    connectors_dir.join(ENTITLEMENTS_FILENAME)
}

type EntitlementRecordMap = HashMap<String, EntitlementRecord>;

/// Fails closed, same as `grants.rs`'s `read_all`: a corrupt or missing
/// file reads as nothing entitled, never as stale entries that would
/// silently unlock a paid connector the record can no longer account for.
fn read_all(connectors_dir: &Path) -> EntitlementRecordMap {
    let Ok(text) = std::fs::read_to_string(entitlements_file(connectors_dir)) else {
        return EntitlementRecordMap::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_all(connectors_dir: &Path, record: &EntitlementRecordMap) {
    if std::fs::create_dir_all(connectors_dir).is_err() {
        return;
    }
    if let Ok(json) = serde_json::to_string_pretty(record) {
        let _ = std::fs::write(entitlements_file(connectors_dir), json);
    }
}

pub fn has_entitlement(connectors_dir: &Path, connector_id: &str) -> bool {
    read_all(connectors_dir).contains_key(connector_id)
}

pub fn list_entitlements(connectors_dir: &Path) -> Vec<EntitlementRecord> {
    read_all(connectors_dir).into_values().collect()
}

pub fn grant_entitlement(
    connectors_dir: &Path,
    connector_id: &str,
    source: &str,
) -> EntitlementRecord {
    let mut record = read_all(connectors_dir);
    let entitlement = EntitlementRecord {
        connector_id: connector_id.to_string(),
        granted_at: super::grants::iso_now(),
        source: source.to_string(),
    };
    record.insert(connector_id.to_string(), entitlement.clone());
    write_all(connectors_dir, &record);
    entitlement
}

pub fn revoke_entitlement(connectors_dir: &Path, connector_id: &str) {
    let mut record = read_all(connectors_dir);
    record.remove(connector_id);
    write_all(connectors_dir, &record);
}

/// Whether a connector may install/run at all: free connectors always are;
/// paid ones only with a recorded entitlement. The one check every paid-
/// connector gate (install-time, dispatch-time) should call, rather than
/// each reimplementing `pricing().model == Paid`.
pub fn is_connector_usable(connectors_dir: &Path, manifest: &ConnectorManifest) -> bool {
    match manifest.pricing() {
        crate::connectors::manifest::Pricing::Free => true,
        crate::connectors::manifest::Pricing::Paid { .. } => {
            has_entitlement(connectors_dir, manifest.id())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::manifest::ConnectorManifestTier1;

    fn unique_suffix() -> String {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("{}-{n}", std::process::id())
    }

    fn scratch_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-entitlements-test-{}",
            unique_suffix()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn paid_manifest(id: &str) -> ConnectorManifest {
        let json = serde_json::json!({
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
            "pricing": { "model": "paid", "productId": "fs.sovereign.test.unlock" }
        });
        let tier1: ConnectorManifestTier1 = serde_json::from_value(json).unwrap();
        ConnectorManifest::Tier1(tier1)
    }

    #[test]
    fn has_no_entitlements_by_default() {
        let dir = scratch_dir();
        assert!(!has_entitlement(&dir, "fs.sovereign.test"));
        assert!(list_entitlements(&dir).is_empty());
    }

    #[test]
    fn round_trips_a_granted_entitlement() {
        let dir = scratch_dir();
        let record = grant_entitlement(&dir, "fs.sovereign.test", "dev-override");
        assert_eq!(record.connector_id, "fs.sovereign.test");
        assert_eq!(record.source, "dev-override");
        assert!(has_entitlement(&dir, "fs.sovereign.test"));
        assert_eq!(list_entitlements(&dir), vec![record]);
    }

    #[test]
    fn revokes_an_entitlement() {
        let dir = scratch_dir();
        grant_entitlement(&dir, "fs.sovereign.test", "dev-override");
        revoke_entitlement(&dir, "fs.sovereign.test");
        assert!(!has_entitlement(&dir, "fs.sovereign.test"));
    }

    #[test]
    fn revoking_an_id_that_was_never_entitled_is_a_noop() {
        let dir = scratch_dir();
        grant_entitlement(&dir, "fs.sovereign.test", "dev-override");
        revoke_entitlement(&dir, "fs.sovereign.never-entitled");
        assert!(has_entitlement(&dir, "fs.sovereign.test"));
    }

    #[test]
    fn fails_closed_on_corrupt_state_rather_than_panicking() {
        let dir = scratch_dir();
        grant_entitlement(&dir, "fs.sovereign.test", "dev-override");
        std::fs::write(entitlements_file(&dir), "{ not json").unwrap();

        assert!(!has_entitlement(&dir, "fs.sovereign.test"));
        assert!(list_entitlements(&dir).is_empty());
    }

    #[test]
    fn a_paid_connector_with_no_entitlement_is_not_usable() {
        let dir = scratch_dir();
        let manifest = paid_manifest("fs.sovereign.test");
        assert!(!is_connector_usable(&dir, &manifest));
    }

    #[test]
    fn a_paid_connector_with_a_recorded_entitlement_is_usable() {
        let dir = scratch_dir();
        let manifest = paid_manifest("fs.sovereign.test");
        grant_entitlement(&dir, manifest.id(), "dev-override");
        assert!(is_connector_usable(&dir, &manifest));
    }

    #[test]
    fn a_paid_connector_stops_being_usable_once_its_entitlement_is_revoked() {
        let dir = scratch_dir();
        let manifest = paid_manifest("fs.sovereign.test");
        grant_entitlement(&dir, manifest.id(), "dev-override");
        revoke_entitlement(&dir, manifest.id());
        assert!(!is_connector_usable(&dir, &manifest));
    }
}
