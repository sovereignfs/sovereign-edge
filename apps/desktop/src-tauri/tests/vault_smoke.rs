//! Task 12.3's own review bar: verify credential isolation and destruction
//! against the **real** OS credential store, not just `keyring::mock` — this
//! session's own standing guidance is that mocks alone have hidden real
//! defects here before.
//!
//! `#[ignore]`d because it writes real entries into the current user's OS
//! keychain (under clearly scratch-prefixed connector ids) — not something a
//! casual `cargo test` or CI should do unattended. Run it explicitly:
//!
//! ```sh
//! cargo test --test vault_smoke -- --ignored --nocapture
//! ```
//!
//! Every entry this test creates is deleted again before it exits, success
//! or failure, so it doesn't leave scratch credentials behind in the real
//! keychain.

use sovereign_edge_desktop_lib::secure_storage::open_vault;

#[test]
#[ignore]
fn isolates_and_destroys_credentials_in_the_real_keychain() {
    let search = open_vault("fs.sovereign.edge.vault-smoke-search").expect("invalid connector id");
    let tasks = open_vault("fs.sovereign.edge.vault-smoke-tasks").expect("invalid connector id");

    // Clean up first, in case a previous run of this test panicked before
    // its own cleanup ran.
    let _ = search.clear(&["apiToken".to_string()]);
    let _ = tasks.clear(&["apiToken".to_string()]);

    let result = std::panic::catch_unwind(|| {
        assert_eq!(
            search.read("apiToken").expect("read failed"),
            None,
            "expected no leftover credential before this test wrote one"
        );

        search
            .write("apiToken", "search-secret")
            .expect("write failed");
        tasks
            .write("apiToken", "tasks-secret")
            .expect("write failed");

        eprintln!("wrote real Keychain entries for two scratch connectors sharing the credential key \"apiToken\"");

        assert_eq!(
            search.read("apiToken").expect("read failed"),
            Some("search-secret".to_string())
        );
        assert_eq!(
            tasks.read("apiToken").expect("read failed"),
            Some("tasks-secret".to_string())
        );

        // Isolation: clearing one connector's credential must not touch the
        // other's, even though both use the same credential key.
        search
            .clear(&["apiToken".to_string()])
            .expect("clear failed");
        eprintln!("cleared search's credential");

        assert_eq!(
            search.read("apiToken").expect("read failed"),
            None,
            "search's credential should be gone after clear()"
        );
        assert_eq!(
            tasks.read("apiToken").expect("read failed"),
            Some("tasks-secret".to_string()),
            "tasks's credential must survive search's clear() — this is the isolation guarantee this task exists to provide"
        );
    });

    // Always clean up the real keychain, even if an assertion above failed.
    let _ = search.clear(&["apiToken".to_string()]);
    let _ = tasks.clear(&["apiToken".to_string()]);

    result.expect("isolation/destruction assertions failed against the real keychain");
    eprintln!("cleaned up both scratch entries; real-keychain isolation verified");
}
