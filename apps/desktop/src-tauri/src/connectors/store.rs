//! The public connector registry (task 5.4), fetched live (task 5.5),
//! mirroring `apps/mobile/src/connectors/store/registry.ts`.
//!
//! This is the first network access in this app that is not a specific
//! granted connector's own request — it's the store *browsing* the public
//! index, before any install/grant decision exists. Reuses `AppState`'s
//! existing `connector_http_client` (built via `net_guard::
//! guarded_client_builder()`, same as the per-connector dispatch client)
//! rather than constructing a second one, and wraps only the request
//! `.send()` in `net_guard::allow_network`, mirroring
//! `connectors::runtime::execute`'s own pattern — reading the body
//! afterward is not itself a new network operation there either.

use super::manifest::{validate_manifest, ConnectorManifest, ValidationResult};
use serde::Deserialize;

const REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/sovereignfs/sovereign-edge/main/registry/connectors.json";

#[derive(Debug, Clone)]
pub struct RegistryConnector {
    pub id: String,
    pub submitted_by_name: String,
    pub manifest: ConnectorManifest,
}

#[derive(Debug)]
pub enum StoreError {
    Network(String),
    Malformed(String),
}

#[derive(Deserialize)]
struct RawRegistry {
    #[serde(rename = "registryVersion")]
    registry_version: u64,
    connectors: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct SubmittedBy {
    name: String,
}

/// Fetches and re-validates the registry.
///
/// Re-validation is defense in depth, not redundant with `registry/
/// validate.mjs`'s own CI check: that check guards what gets *merged*,
/// this guards what the app actually *loads*, over a network path that
/// could be tampered with regardless of what CI saw. An entry that fails
/// re-validation is dropped, not treated as a fetch failure — one bad
/// entry should not make the whole store unusable.
pub async fn fetch_registry(
    client: &reqwest::Client,
) -> Result<Vec<RegistryConnector>, StoreError> {
    let response = crate::net_guard::allow_network(client.get(REGISTRY_URL).send())
        .await
        .map_err(|cause| StoreError::Network(cause.to_string()))?;
    parse_registry_response(response).await
}

/// Split out from `fetch_registry` so tests can point the real parsing
/// logic at a local server without a second, hand-duplicated copy of it —
/// only the URL (hardcoded in `fetch_registry`, this app has no config
/// surface for it) and the `allow_network` scope around the request
/// itself differ between the real path and the test path.
async fn parse_registry_response(
    response: reqwest::Response,
) -> Result<Vec<RegistryConnector>, StoreError> {
    if !response.status().is_success() {
        return Err(StoreError::Network(format!("HTTP {}", response.status())));
    }

    // `.text()` + `serde_json::from_str`, not `.json()` — this crate's
    // `reqwest` dependency has no `json` feature enabled (`execute.rs`'s
    // own request path reads `.bytes()` for the same reason), and adding
    // one for a single call site here isn't worth a new build-time
    // dependency surface.
    let text = response
        .text()
        .await
        .map_err(|cause| StoreError::Malformed(cause.to_string()))?;
    let raw: RawRegistry =
        serde_json::from_str(&text).map_err(|cause| StoreError::Malformed(cause.to_string()))?;

    if raw.registry_version != 1 {
        return Err(StoreError::Malformed(format!(
            "unsupported registryVersion {}",
            raw.registry_version
        )));
    }

    let mut connectors = Vec::new();
    for entry in raw.connectors {
        let Some(id) = entry.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        let Some(submitted_by) = entry
            .get("submittedBy")
            .and_then(|v| serde_json::from_value::<SubmittedBy>(v.clone()).ok())
        else {
            continue;
        };
        let Some(manifest_json) = entry.get("manifest") else {
            continue;
        };

        let manifest = match validate_manifest(manifest_json) {
            ValidationResult::Valid(manifest) => *manifest,
            ValidationResult::Invalid(_) => continue,
        };
        if manifest.id() != id {
            continue;
        }

        connectors.push(RegistryConnector {
            id: id.to_string(),
            submitted_by_name: submitted_by.name,
            manifest,
        });
    }

    Ok(connectors)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// Real TCP, mirroring `connectors::orchestration`'s own real-socket
    /// test: binds an ephemeral loopback port, serves one hand-built HTTP
    /// response, and points `fetch_registry` at it via a rewritten `client`
    /// call — proving the fetch+parse+re-validate path against a genuine
    /// response, not a mocked one.
    fn serve_one_response(listener: TcpListener, body: String) {
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf);
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
        });
    }

    fn manifest_json(id: &str, origin: &str) -> serde_json::Value {
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
            "permissions": { "network": { "origins": [origin] } },
            "request": {
                "method": "GET",
                "origin": origin,
                "path": [{ "literal": "x" }]
            },
            "response": { "textFrom": "x", "maxBytes": 1000 },
            "pricing": { "model": "free" }
        })
    }

    /// Points the real `fetch_registry` request logic at a local address
    /// instead of the hardcoded `REGISTRY_URL`, sharing `parse_registry_
    /// response` (the real function's own parsing code) rather than a
    /// second, hand-duplicated copy of it.
    async fn fetch_registry_at(
        client: &reqwest::Client,
        addr: std::net::SocketAddr,
    ) -> Result<Vec<RegistryConnector>, StoreError> {
        let url = format!("http://{addr}/registry/connectors.json");
        let response = crate::net_guard::allow_network(client.get(&url).send())
            .await
            .map_err(|cause| StoreError::Network(cause.to_string()))?;
        parse_registry_response(response).await
    }

    #[tokio::test]
    async fn fetches_and_validates_a_real_http_response() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let body = serde_json::json!({
            "registryVersion": 1,
            "connectors": [{
                "id": "fs.sovereign.test",
                "submittedBy": { "name": "kasunben" },
                "manifest": manifest_json("fs.sovereign.test", "https://api.example.org"),
            }]
        })
        .to_string();
        serve_one_response(listener, body);

        let client = crate::net_guard::guarded_client_builder().build().unwrap();
        let connectors = fetch_registry_at(&client, addr).await.unwrap();

        assert_eq!(connectors.len(), 1);
        assert_eq!(connectors[0].id, "fs.sovereign.test");
        assert_eq!(connectors[0].submitted_by_name, "kasunben");
    }

    #[tokio::test]
    async fn drops_an_entry_whose_manifest_fails_revalidation() {
        // request.origin not in permissions.network.origins — exactly the
        // "lies about its declared network domain" shape the validator
        // rejects, proven end to end via a real fetch against a real
        // local server rather than asserting on validate_manifest alone.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let mut lying = manifest_json("fs.sovereign.lying", "https://good.example.org");
        lying["request"]["origin"] = serde_json::json!("https://evil.example.org");
        let body = serde_json::json!({
            "registryVersion": 1,
            "connectors": [
                {
                    "id": "fs.sovereign.good",
                    "submittedBy": { "name": "kasunben" },
                    "manifest": manifest_json("fs.sovereign.good", "https://good.example.org"),
                },
                {
                    "id": "fs.sovereign.lying",
                    "submittedBy": { "name": "nobody" },
                    "manifest": lying,
                }
            ]
        })
        .to_string();
        serve_one_response(listener, body);

        let client = crate::net_guard::guarded_client_builder().build().unwrap();
        let connectors = fetch_registry_at(&client, addr).await.unwrap();

        assert_eq!(connectors.len(), 1);
        assert_eq!(connectors[0].id, "fs.sovereign.good");
    }

    #[tokio::test]
    async fn drops_an_entry_whose_id_does_not_match_its_manifest_id() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let body = serde_json::json!({
            "registryVersion": 1,
            "connectors": [{
                "id": "fs.sovereign.mismatched",
                "submittedBy": { "name": "kasunben" },
                "manifest": manifest_json("fs.sovereign.actual", "https://api.example.org"),
            }]
        })
        .to_string();
        serve_one_response(listener, body);

        let client = crate::net_guard::guarded_client_builder().build().unwrap();
        let connectors = fetch_registry_at(&client, addr).await.unwrap();

        assert!(connectors.is_empty());
    }
}
