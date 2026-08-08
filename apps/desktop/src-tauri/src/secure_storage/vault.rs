//! Per-connector credential storage, backed by the OS keychain (task 12.3),
//! mirroring `apps/mobile/src/connectors/permissions/vault.ts`.
//!
//! The isolation requirement — "one connector's token is never visible to
//! another" — is met **by construction rather than by discipline**. There is
//! no exported function that takes a connector id and a key; the only way to
//! reach a credential is through a `ConnectorVault` handle, and a handle can
//! only ever address its own connector's namespace because it closes over
//! the id and builds every key itself.
//!
//! A caller holding Search's vault cannot name Sovereign Tasks' token. Not
//! "should not" — cannot, without going around this module to `keyring`
//! directly, which is a visible, reviewable act rather than an easy mistake.
//!
//! Values go to macOS Keychain / Windows Credential Manager / Linux Secret
//! Service (per target-gated feature — see `Cargo.toml`), so they are not
//! readable from a filesystem dump of the app's data directory the way a
//! plain config file would be.

/// Keys are namespaced so two connectors cannot collide, accidentally or
/// otherwise. Used as the `keyring` "service" for every entry this module
/// creates; the connector id and credential key are folded into the
/// "username" (see `ConnectorVault::with_entry`) — the same single-
/// namespace-plus-composite-key shape `vault.ts` uses, not a different one
/// that happens to also work.
const NAMESPACE: &str = "sovereign.connector";

/// `keyring` backends vary in which characters they accept; connector ids
/// and credential keys are already constrained by the manifest schema, so
/// this is a belt-and-braces guard against a caller that skipped validation
/// rather than an expected path — same rationale as `vault.ts`'s own
/// `SAFE_SEGMENT`.
fn is_safe_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

#[derive(Debug, thiserror::Error)]
pub enum VaultError {
    #[error("Unsafe {what} \"{segment}\". Expected only letters, digits, \".\", \"-\", or \"_\". A manifest that reached here without validation is a bug.")]
    UnsafeSegment { what: &'static str, segment: String },
    #[error("could not access the credential store: {0}")]
    Backend(#[from] keyring::Error),
}

fn assert_safe(segment: &str, what: &'static str) -> Result<(), VaultError> {
    if is_safe_segment(segment) {
        Ok(())
    } else {
        Err(VaultError::UnsafeSegment {
            what,
            segment: segment.to_string(),
        })
    }
}

/// A credential namespace scoped to one connector. The only way to reach a
/// stored credential — see this module's own doc comment for why that
/// matters.
///
/// Caches one `keyring::Entry` per credential key rather than constructing a
/// fresh one on every call. Real backends (Keychain etc.) store by
/// service+username regardless, so this is purely an efficiency win there —
/// but it's load-bearing for `keyring::mock`, whose documented persistence
/// model is "no persistence other than in the entry itself": a mock entry
/// constructed fresh per call would never see what an earlier call wrote,
/// even for the identical service+username. Caching makes this module's own
/// unit tests exercise real read/write/clear round trips instead of talking
/// past each other.
#[derive(Debug)]
pub struct ConnectorVault {
    connector_id: String,
    entries: std::sync::Mutex<std::collections::HashMap<String, keyring::Entry>>,
}

impl ConnectorVault {
    fn with_entry<T>(
        &self,
        credential_key: &str,
        f: impl FnOnce(&keyring::Entry) -> keyring::Result<T>,
    ) -> Result<T, VaultError> {
        assert_safe(credential_key, "credential key")?;
        let mut entries = self.entries.lock().expect("vault entry cache poisoned");
        let entry = match entries.entry(credential_key.to_string()) {
            std::collections::hash_map::Entry::Occupied(occupied) => occupied.into_mut(),
            std::collections::hash_map::Entry::Vacant(vacant) => {
                let username = format!("{}.{credential_key}", self.connector_id);
                vacant.insert(keyring::Entry::new(NAMESPACE, &username)?)
            }
        };
        Ok(f(entry)?)
    }

    pub fn connector_id(&self) -> &str {
        &self.connector_id
    }

    /// Reads one of this connector's credentials. `Ok(None)` when never
    /// stored — mirrors `SecureStore.getItemAsync` returning `null` rather
    /// than rejecting on a missing key.
    pub fn read(&self, credential_key: &str) -> Result<Option<String>, VaultError> {
        match self.with_entry(credential_key, keyring::Entry::get_password) {
            Ok(value) => Ok(Some(value)),
            Err(VaultError::Backend(keyring::Error::NoEntry)) => Ok(None),
            Err(cause) => Err(cause),
        }
    }

    pub fn write(&self, credential_key: &str, value: &str) -> Result<(), VaultError> {
        self.with_entry(credential_key, |entry| entry.set_password(value))
    }

    /// Removes the named credentials. Used when a grant is revoked (task
    /// 12.4's job to call this). Sequential rather than parallel — a
    /// partial failure should leave the rest deleted, and the keychain is
    /// not a hot path, matching `vault.ts`'s own `clear()` exactly. A
    /// missing key is treated as already-cleared, same as
    /// `SecureStore.deleteItemAsync`'s no-throw-on-missing-key behavior.
    pub fn clear(&self, credential_keys: &[String]) -> Result<(), VaultError> {
        for credential_key in credential_keys {
            match self.with_entry(credential_key, keyring::Entry::delete_credential) {
                Ok(()) | Err(VaultError::Backend(keyring::Error::NoEntry)) => {}
                Err(cause) => return Err(cause),
            }
        }
        Ok(())
    }
}

/// Opens the credential namespace for one connector.
///
/// The id is validated once, here, so every key derived from it afterwards
/// is known safe.
pub fn open_vault(connector_id: &str) -> Result<ConnectorVault, VaultError> {
    assert_safe(connector_id, "connector id")?;
    Ok(ConnectorVault {
        connector_id: connector_id.to_string(),
        entries: std::sync::Mutex::new(std::collections::HashMap::new()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Routes every `keyring::Entry` in this test binary through an
    /// in-memory mock rather than the real OS keychain — `keyring::mock` is
    /// always compiled in (no feature gate), and setting it is a
    /// process-global op, safe here because this test binary never also
    /// runs against a real backend (that's `tests/vault_smoke.rs`'s job, a
    /// separate binary/process per Cargo's integration-test convention).
    fn use_mock_backend() {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    }

    #[test]
    fn rejects_an_unsafe_connector_id() {
        use_mock_backend();
        let error = open_vault("not safe!").unwrap_err();
        assert!(matches!(
            error,
            VaultError::UnsafeSegment {
                what: "connector id",
                ..
            }
        ));
    }

    #[test]
    fn rejects_an_unsafe_credential_key() {
        use_mock_backend();
        let vault = open_vault("fs.sovereign.search").unwrap();
        let error = vault.write("not safe!", "x").unwrap_err();
        assert!(matches!(
            error,
            VaultError::UnsafeSegment {
                what: "credential key",
                ..
            }
        ));
    }

    #[test]
    fn reads_null_for_a_credential_never_stored() {
        use_mock_backend();
        let vault = open_vault("fs.sovereign.search").unwrap();
        assert_eq!(vault.read("apiToken").unwrap(), None);
    }

    #[test]
    fn round_trips_a_credential() {
        use_mock_backend();
        let vault = open_vault("fs.sovereign.search").unwrap();
        vault.write("apiToken", "search-secret").unwrap();
        assert_eq!(
            vault.read("apiToken").unwrap(),
            Some("search-secret".to_string())
        );
    }

    // Mirrors `grants.test.ts`'s `describe('revoking one connector leaves
    // every other untouched')` block, its own comment there calling this
    // "the property the whole design exists to provide". A second
    // connector sharing the *same* credential key as the first is the case
    // a naive key scheme would collide on.
    #[test]
    fn does_not_touch_another_connectors_stored_credentials() {
        use_mock_backend();
        let search = open_vault("fs.sovereign.search").unwrap();
        let tasks = open_vault("fs.sovereign.tasks").unwrap();

        search.write("apiToken", "search-secret").unwrap();
        tasks.write("apiToken", "tasks-secret").unwrap();

        search.clear(&["apiToken".to_string()]).unwrap();

        assert_eq!(search.read("apiToken").unwrap(), None);
        assert_eq!(
            tasks.read("apiToken").unwrap(),
            Some("tasks-secret".to_string())
        );
    }

    // Mirrors `grants.test.ts`'s `'destroys credentials when access is
    // revoked'` — this is the vault-level primitive task 12.4's future
    // `revoke()` will call; a real `revoke()` doesn't exist yet (that's
    // 12.4's job), so this verifies the primitive it will be built on.
    #[test]
    fn clear_destroys_the_credential() {
        use_mock_backend();
        let vault = open_vault("fs.sovereign.search").unwrap();
        vault.write("apiToken", "secret").unwrap();

        vault.clear(&["apiToken".to_string()]).unwrap();

        assert_eq!(vault.read("apiToken").unwrap(), None);
    }

    #[test]
    fn clearing_an_already_missing_key_is_not_an_error() {
        use_mock_backend();
        let vault = open_vault("fs.sovereign.search").unwrap();
        vault.clear(&["never-written".to_string()]).unwrap();
    }
}
