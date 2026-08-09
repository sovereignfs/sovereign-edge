//! Non-secret Search connector config (task 13.6), mirroring
//! `apps/mobile/src/connectors/search/config.ts` — which provider, and
//! (for SearXNG) which URL. Deliberately **not** in the vault, mobile's
//! own file explains why: "a user can inspect what they chose without the
//! app mediating." The Tavily API key is the only secret, written
//! separately via `secure_storage::open_vault`.
//!
//! File-I/O pattern mirrors `models::store`'s exact fail-soft convention
//! (`write_active_model_id`/`read_active_model_id`): a write that fails
//! costs one wrong prompt on next launch, not a crash; a read that fails
//! or a missing file reads as "not configured," never as a stale value.
//! Colocated with `grants.json` in the same `connectors_dir` — no new
//! directory resolution needed.

use serde::{Deserialize, Serialize};
use std::path::Path;

const SEARCH_CONFIG_FILENAME: &str = "search-config.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "provider", rename_all = "lowercase")]
pub enum SearchConfig {
    Searxng {
        #[serde(rename = "searxngUrl")]
        url: String,
    },
    Tavily,
}

fn config_file(connectors_dir: &Path) -> std::path::PathBuf {
    connectors_dir.join(SEARCH_CONFIG_FILENAME)
}

pub fn read_search_config(connectors_dir: &Path) -> Option<SearchConfig> {
    let text = std::fs::read_to_string(config_file(connectors_dir)).ok()?;
    serde_json::from_str(&text).ok()
}

pub fn write_search_config(connectors_dir: &Path, config: &SearchConfig) {
    if std::fs::create_dir_all(connectors_dir).is_err() {
        return;
    }
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = std::fs::write(config_file(connectors_dir), json);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // Same hand-rolled scratch-dir pattern `connectors::permissions::grants`'s
    // own tests use — no `tempfile` dependency in this crate. PID + counter:
    // the counter alone is unique only within one process; PID makes it
    // unique across parallel test runs too. Scratch directories aren't
    // cleaned up afterward, same tolerance grants.rs's tests accept.
    fn unique_suffix() -> String {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("{}-{n}", std::process::id())
    }

    fn scratch_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-search-config-test-{}",
            unique_suffix()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn round_trips_searxng_config() {
        let dir = scratch_dir();
        let config = SearchConfig::Searxng {
            url: "https://searx.example.org".to_string(),
        };
        write_search_config(&dir, &config);
        assert_eq!(read_search_config(&dir), Some(config));
    }

    #[test]
    fn round_trips_tavily_config() {
        let dir = scratch_dir();
        write_search_config(&dir, &SearchConfig::Tavily);
        assert_eq!(read_search_config(&dir), Some(SearchConfig::Tavily));
    }

    #[test]
    fn missing_file_reads_as_unconfigured() {
        let dir = scratch_dir();
        assert_eq!(read_search_config(&dir), None);
    }
}
