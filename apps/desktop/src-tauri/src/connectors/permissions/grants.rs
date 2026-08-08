//! Grant/consent state machine (task 12.4), mirroring
//! `apps/mobile/src/connectors/permissions/grants.ts`.
//!
//! Takes `grants_dir: &Path` as an explicit first parameter on every
//! function rather than mobile's implicit `Paths.document/connectors/`
//! global — mirrors `models::store`'s own pattern (`models_directory(base)`)
//! so this module is testable without a running app or shared global state.

use super::types::{ConnectorGrant, GrantState};
use crate::connectors::manifest::ConnectorManifest;
use crate::secure_storage::{self, VaultError};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const GRANTS_DIRNAME: &str = "connectors";
const GRANTS_FILENAME: &str = "grants.json";

/// Ensures `base/connectors` exists and returns it — the directory callers
/// (e.g. `lib.rs`'s `run()`) should pass as every other function's
/// `grants_dir` parameter, the same `models_directory(base)` pattern
/// `models::store` uses for its own on-disk layout.
pub fn grants_directory(base: &Path) -> std::io::Result<PathBuf> {
    let dir = base.join(GRANTS_DIRNAME);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn grants_file(grants_dir: &Path) -> PathBuf {
    grants_dir.join(GRANTS_FILENAME)
}

type GrantRecord = HashMap<String, ConnectorGrant>;

/// Fails closed: a corrupt or missing file reads as no grants at all,
/// never as stale ones — the opposite default would silently restore
/// access the record can no longer account for.
fn read_all(grants_dir: &Path) -> GrantRecord {
    let Ok(text) = std::fs::read_to_string(grants_file(grants_dir)) else {
        return GrantRecord::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_all(grants_dir: &Path, record: &GrantRecord) {
    // Losing a write here costs one wrong prompt on next launch, which the
    // user can correct — same tolerance `models::store` applies to its own
    // best-effort preference writes.
    if std::fs::create_dir_all(grants_dir).is_err() {
        return;
    }
    if let Ok(json) = serde_json::to_string_pretty(record) {
        let _ = std::fs::write(grants_file(grants_dir), json);
    }
}

pub fn grant_for(grants_dir: &Path, connector_id: &str) -> ConnectorGrant {
    read_all(grants_dir)
        .remove(connector_id)
        .unwrap_or_else(|| ConnectorGrant {
            connector_id: connector_id.to_string(),
            state: GrantState::NotAsked,
            decided_at: None,
            granted_scope: Vec::new(),
        })
}

pub fn list_grants(grants_dir: &Path) -> Vec<ConnectorGrant> {
    read_all(grants_dir).into_values().collect()
}

fn set_grant(
    grants_dir: &Path,
    connector_id: &str,
    state: GrantState,
    granted_scope: Vec<String>,
) -> ConnectorGrant {
    let mut record = read_all(grants_dir);
    let grant = ConnectorGrant {
        connector_id: connector_id.to_string(),
        state,
        decided_at: Some(iso_now()),
        granted_scope,
    };
    record.insert(connector_id.to_string(), grant.clone());
    write_all(grants_dir, &record);
    grant
}

pub fn grant(grants_dir: &Path, manifest: &ConnectorManifest) -> ConnectorGrant {
    set_grant(
        grants_dir,
        manifest.id(),
        GrantState::Granted,
        manifest.scope(),
    )
}

pub fn deny(grants_dir: &Path, connector_id: &str) -> ConnectorGrant {
    set_grant(grants_dir, connector_id, GrantState::Denied, Vec::new())
}

/// Clears the vault (Tier 1 credential keys only — Tier 3 has no
/// app-managed secret) *before* setting `Denied`, so "revoked" describes
/// the device, not just the UI.
pub fn revoke(
    grants_dir: &Path,
    manifest: &ConnectorManifest,
) -> Result<ConnectorGrant, VaultError> {
    let keys: Vec<String> = match manifest {
        ConnectorManifest::Tier1(m) => m
            .permissions
            .credentials
            .iter()
            .flatten()
            .map(|c| c.key.clone())
            .collect(),
        ConnectorManifest::Tier3(_) => Vec::new(),
    };
    secure_storage::open_vault(manifest.id())?.clear(&keys)?;
    Ok(set_grant(
        grants_dir,
        manifest.id(),
        GrantState::Denied,
        Vec::new(),
    ))
}

/// A later manifest widening its declared scope (a new origin, a new
/// capability) must not silently inherit an earlier consent — `grant()`
/// snapshots `grantedScope` at grant time rather than re-deriving it live,
/// and this is what detects the mismatch.
pub fn needs_redecision(grants_dir: &Path, manifest: &ConnectorManifest) -> bool {
    let existing = grant_for(grants_dir, manifest.id());
    if existing.state != GrantState::Granted {
        return false;
    }
    let agreed: std::collections::HashSet<&str> =
        existing.granted_scope.iter().map(String::as_str).collect();
    manifest
        .scope()
        .iter()
        .any(|s| !agreed.contains(s.as_str()))
}

pub fn is_allowed(grants_dir: &Path, manifest: &ConnectorManifest) -> bool {
    grant_for(grants_dir, manifest.id()).state == GrantState::Granted
        && !needs_redecision(grants_dir, manifest)
}

/// UTC `YYYY-MM-DDTHH:MM:SS.sssZ`, matching `Date.prototype.toISOString()`.
/// No date/time crate dependency for one timestamp format — the
/// days-since-epoch → civil date conversion is Howard Hinnant's public
/// domain `civil_from_days` algorithm (http://howardhinnant.github.io/date_algorithms.html).
fn iso_now() -> String {
    let since_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(std::time::Duration::ZERO);
    let secs = since_epoch.as_secs();
    let millis = since_epoch.subsec_millis();
    let days = (secs / 86_400) as i64;
    let time_of_day = secs % 86_400;
    let (h, m, s) = (
        time_of_day / 3600,
        (time_of_day / 60) % 60,
        time_of_day % 60,
    );
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.{millis:03}Z")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::manifest::{
        ConnectorManifestTier1, ConnectorManifestTier3, CredentialDeclaration, DevicePermissions,
        HttpMethod, NativeHandlerRef, NetworkPermissions, PathPart, Pricing, RequestTemplate,
        ResponseTemplate, Tier1Permissions, Tier3Permissions, ToolDefinition, ToolParameters,
    };

    fn use_mock_keyring() {
        crate::secure_storage::vault::use_test_keyring_backend();
    }

    /// PID *and* a counter: the counter alone is unique only within one
    /// process (tests run in parallel on separate threads, so a clock
    /// timestamp alone can collide), but scratch directories aren't
    /// cleaned up afterward, so a bare counter starting at 0 every run
    /// collides with a previous run's leftover directory of the same name
    /// under the OS temp dir. PID makes it unique across runs too.
    fn unique_suffix() -> String {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("{}-{n}", std::process::id())
    }

    fn scratch_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-grants-test-{}",
            unique_suffix()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn tier1(id: &str, origin: &str, credential_key: Option<&str>) -> ConnectorManifest {
        ConnectorManifest::Tier1(ConnectorManifestTier1 {
            manifest_version: 1,
            id: id.to_string(),
            name: "Test Connector".to_string(),
            version: "1.0.0".to_string(),
            summary: "A test fixture.".to_string(),
            tier: 1,
            platforms: vec![],
            tool: ToolDefinition {
                name: "test_tool".to_string(),
                description: "A test tool.".to_string(),
                parameters: ToolParameters {
                    type_: "object".to_string(),
                    properties: serde_json::Map::new(),
                    required: None,
                    extra: serde_json::Map::new(),
                },
            },
            pricing: Pricing::Free,
            permissions: Tier1Permissions {
                network: NetworkPermissions {
                    origins: vec![origin.to_string()],
                },
                credentials: credential_key.map(|key| {
                    vec![CredentialDeclaration {
                        key: key.to_string(),
                        label: "A credential".to_string(),
                    }]
                }),
            },
            request: RequestTemplate {
                method: HttpMethod::Get,
                origin: origin.to_string(),
                path: vec![PathPart::Literal {
                    literal: "x".to_string(),
                }],
                query: None,
                headers: None,
                body: None,
            },
            response: ResponseTemplate {
                text_from: "x".to_string(),
                max_bytes: 1000,
            },
        })
    }

    fn tier3(id: &str, capability: &str) -> ConnectorManifest {
        ConnectorManifest::Tier3(ConnectorManifestTier3 {
            manifest_version: 1,
            id: id.to_string(),
            name: "Test Device Connector".to_string(),
            version: "1.0.0".to_string(),
            summary: "A test fixture.".to_string(),
            tier: 3,
            platforms: vec![],
            tool: ToolDefinition {
                name: "test_tool".to_string(),
                description: "A test tool.".to_string(),
                parameters: ToolParameters {
                    type_: "object".to_string(),
                    properties: serde_json::Map::new(),
                    required: None,
                    extra: serde_json::Map::new(),
                },
            },
            pricing: Pricing::Free,
            permissions: Tier3Permissions {
                device: DevicePermissions {
                    capabilities: vec![capability.to_string()],
                },
            },
            handler: NativeHandlerRef {
                capability: capability.to_string(),
            },
        })
    }

    #[test]
    fn starts_at_not_asked_rather_than_denied() {
        let dir = scratch_dir();
        let grant = grant_for(&dir, "fs.sovereign.search");
        assert_eq!(grant.state, GrantState::NotAsked);
        let manifest = tier1("fs.sovereign.search", "https://searx.example.org", None);
        assert!(!is_allowed(&dir, &manifest));
    }

    #[test]
    fn records_consent_for_exactly_the_declared_origins() {
        let dir = scratch_dir();
        let manifest = tier1("fs.sovereign.search", "https://searx.example.org", None);
        let result = grant(&dir, &manifest);
        assert_eq!(result.state, GrantState::Granted);
        assert_eq!(
            result.granted_scope,
            vec!["https://searx.example.org".to_string()]
        );
        assert!(is_allowed(&dir, &manifest));
    }

    #[test]
    fn keeps_a_denial_distinct_from_never_having_asked() {
        let dir = scratch_dir();
        deny(&dir, "fs.sovereign.search");
        assert_eq!(
            grant_for(&dir, "fs.sovereign.search").state,
            GrantState::Denied
        );
        let manifest = tier1("fs.sovereign.search", "https://searx.example.org", None);
        assert!(!is_allowed(&dir, &manifest));
    }

    // Mirrors `grants.test.ts`'s `describe('revoking one connector leaves
    // every other untouched')` — "the property the whole design exists to
    // provide."
    #[test]
    fn revoking_one_connector_does_not_affect_another_connectors_grant() {
        use_mock_keyring();
        let dir = scratch_dir();
        let search = tier1("fs.sovereign.search", "https://searx.example.org", None);
        let tasks = tier1("fs.sovereign.tasks", "https://tasks.example.org", None);
        grant(&dir, &search);
        grant(&dir, &tasks);

        revoke(&dir, &search).unwrap();

        assert!(!is_allowed(&dir, &search));
        assert!(is_allowed(&dir, &tasks));
    }

    #[test]
    fn revoking_one_connector_does_not_touch_another_connectors_stored_credentials() {
        use_mock_keyring();
        let dir = scratch_dir();
        // Unique ids, not the literal fixture ids: the test keyring backend
        // (`use_test_keyring_backend`) is process-global by necessity (see
        // its own doc comment), shared with every other test in this
        // binary that touches a vault — a literal id could collide with an
        // unrelated test running in parallel.
        let suffix = unique_suffix();
        let search = tier1(
            &format!("fs.sovereign.search.{suffix}"),
            "https://searx.example.org",
            Some("apiToken"),
        );
        let tasks = tier1(
            &format!("fs.sovereign.tasks.{suffix}"),
            "https://tasks.example.org",
            Some("apiToken"),
        );
        secure_storage::open_vault(search.id())
            .unwrap()
            .write("apiToken", "search-secret")
            .unwrap();
        secure_storage::open_vault(tasks.id())
            .unwrap()
            .write("apiToken", "tasks-secret")
            .unwrap();
        grant(&dir, &search);
        grant(&dir, &tasks);

        revoke(&dir, &search).unwrap();

        assert_eq!(
            secure_storage::open_vault(search.id())
                .unwrap()
                .read("apiToken")
                .unwrap(),
            None
        );
        // Same credential *key* on both connectors — the case a naive key
        // scheme would collide on.
        assert_eq!(
            secure_storage::open_vault(tasks.id())
                .unwrap()
                .read("apiToken")
                .unwrap(),
            Some("tasks-secret".to_string())
        );
    }

    #[test]
    fn destroys_credentials_when_access_is_revoked() {
        use_mock_keyring();
        let dir = scratch_dir();
        let search = tier1(
            &format!("fs.sovereign.search.{}", unique_suffix()),
            "https://searx.example.org",
            Some("apiToken"),
        );
        secure_storage::open_vault(search.id())
            .unwrap()
            .write("apiToken", "secret")
            .unwrap();
        grant(&dir, &search);

        revoke(&dir, &search).unwrap();

        assert_eq!(
            secure_storage::open_vault(search.id())
                .unwrap()
                .read("apiToken")
                .unwrap(),
            None
        );
    }

    #[test]
    fn re_asks_when_an_update_adds_an_origin() {
        let dir = scratch_dir();
        let search = tier1("fs.sovereign.search", "https://searx.example.org", None);
        grant(&dir, &search);

        let mut widened = tier1("fs.sovereign.search", "https://searx.example.org", None);
        if let ConnectorManifest::Tier1(m) = &mut widened {
            m.permissions
                .network
                .origins
                .push("https://analytics.example.com".to_string());
        }

        assert!(needs_redecision(&dir, &widened));
        assert!(!is_allowed(&dir, &widened));
    }

    #[test]
    fn does_not_re_ask_when_an_update_narrows_or_keeps_the_origins() {
        let dir = scratch_dir();
        let search = tier1("fs.sovereign.search", "https://searx.example.org", None);
        grant(&dir, &search);

        assert!(!needs_redecision(&dir, &search));
        assert!(is_allowed(&dir, &search));
    }

    #[test]
    fn fails_closed_when_the_grant_record_is_corrupt() {
        let dir = scratch_dir();
        let search = tier1("fs.sovereign.search", "https://searx.example.org", None);
        grant(&dir, &search);
        std::fs::write(grants_file(&dir), "{ not json").unwrap();

        assert!(!is_allowed(&dir, &search));
        assert_eq!(list_grants(&dir), Vec::new());
    }

    #[test]
    fn lists_every_connector_the_user_has_decided_on() {
        let dir = scratch_dir();
        let search = tier1("fs.sovereign.search", "https://searx.example.org", None);
        let tasks = tier1("fs.sovereign.tasks", "https://tasks.example.org", None);
        grant(&dir, &search);
        deny(&dir, tasks.id());

        let mut ids_and_states: Vec<(String, GrantState)> = list_grants(&dir)
            .into_iter()
            .map(|g| (g.connector_id, g.state))
            .collect();
        ids_and_states.sort();

        assert_eq!(
            ids_and_states,
            vec![
                ("fs.sovereign.search".to_string(), GrantState::Granted),
                ("fs.sovereign.tasks".to_string(), GrantState::Denied),
            ]
        );
    }

    #[test]
    fn tier3_fills_scope_with_capabilities_not_origins() {
        let dir = scratch_dir();
        let device_info = tier3("fs.sovereign.device-info", "device.info");
        assert_eq!(device_info.scope(), vec!["device.info".to_string()]);

        let result = grant(&dir, &device_info);
        assert_eq!(result.granted_scope, vec!["device.info".to_string()]);
        assert!(is_allowed(&dir, &device_info));
    }

    #[test]
    fn tier3_revokes_without_touching_the_credential_vault() {
        use_mock_keyring();
        let dir = scratch_dir();
        let device_info = tier3("fs.sovereign.device-info", "device.info");
        grant(&dir, &device_info);

        revoke(&dir, &device_info).unwrap();

        assert!(!is_allowed(&dir, &device_info));
        assert_eq!(grant_for(&dir, device_info.id()).state, GrantState::Denied);
    }

    #[test]
    fn tier1_and_tier3_grants_do_not_affect_each_other() {
        let dir = scratch_dir();
        let search = tier1("fs.sovereign.search", "https://searx.example.org", None);
        let device_info = tier3("fs.sovereign.device-info", "device.info");
        grant(&dir, &search);
        grant(&dir, &device_info);

        revoke(&dir, &device_info).unwrap();

        assert!(is_allowed(&dir, &search));
        assert!(!is_allowed(&dir, &device_info));
    }
}
