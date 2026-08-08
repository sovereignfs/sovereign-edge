//! Task 12.4's own review bar, adapted: `search.manifest.json`'s origin
//! (`https://searx.example.org`) is RFC 2606's reserved, guaranteed
//! non-resolving example domain — it cannot be dialed for real, and
//! inventing a way to redirect it there would mean silently rewriting the
//! manifest under test, contradicting "zero changes to the manifest
//! itself" (`connectors::manifest::validate`'s own unit tests already
//! prove the real fixture parses/validates unchanged, and
//! `connectors::runtime::execute`'s own unit tests already prove request
//! construction from that exact fixture matches mobile's jest assertions
//! byte-for-byte).
//!
//! What *is* owed a real test, per this session's own standing guidance
//! (mocks alone have hidden real defects here before): the HTTP dispatch
//! *mechanism* itself — real TCP, real HTTP request/response, real JSON
//! mapping — actually working end to end. This test proves that against a
//! local, hermetic server on a scratch manifest (not `search.manifest.json`
//! — a manifest whose origin can actually be dialed). Fast and needs no
//! external network, so it's a normal (not `--ignored`) `cargo test`.

use sovereign_edge_desktop_lib::connectors::manifest::{
    ConnectorManifest, ConnectorManifestTier1, HttpMethod, NetworkPermissions, PathPart, Pricing,
    RequestTemplate, ResponseTemplate, Tier1Permissions, ToolDefinition, ToolParameters,
};
use sovereign_edge_desktop_lib::connectors::permissions;
use sovereign_edge_desktop_lib::connectors::runtime::{execute_connector_call, ExecutionResult};
use std::io::{Read, Write};
use std::net::TcpListener;

/// Accepts exactly one connection, reads the request (just enough to know
/// it's done — a bare `\r\n\r\n` with no body, which every request this
/// test sends satisfies), and writes back a fixed HTTP/1.1 200 response.
fn serve_one_response(listener: TcpListener, body: &'static str) {
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("test server: accept failed");
        let mut buf = [0u8; 4096];
        let mut received = Vec::new();
        loop {
            let n = stream.read(&mut buf).expect("test server: read failed");
            received.extend_from_slice(&buf[..n]);
            if received.windows(4).any(|w| w == b"\r\n\r\n") || n == 0 {
                break;
            }
        }
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body,
        );
        stream
            .write_all(response.as_bytes())
            .expect("test server: write failed");
    });
}

fn scratch_manifest(origin: String) -> ConnectorManifestTier1 {
    ConnectorManifestTier1 {
        manifest_version: 1,
        id: "fs.sovereign.edge.connector-dispatch-smoke".to_string(),
        name: "Connector Dispatch Smoke".to_string(),
        version: "1.0.0".to_string(),
        summary: "Scratch manifest for task 12.4's real-network dispatch test.".to_string(),
        tier: 1,
        platforms: vec![],
        tool: ToolDefinition {
            name: "scratch_search".to_string(),
            description: "Scratch tool for a local-server round trip test.".to_string(),
            parameters: ToolParameters {
                type_: "object".to_string(),
                properties: serde_json::Map::from_iter([(
                    "query".to_string(),
                    serde_json::json!({"type": "string"}),
                )]),
                required: Some(vec!["query".to_string()]),
                extra: serde_json::Map::new(),
            },
        },
        pricing: Pricing::Free,
        permissions: Tier1Permissions {
            network: NetworkPermissions {
                origins: vec![origin.clone()],
            },
            credentials: None,
        },
        request: RequestTemplate {
            method: HttpMethod::Get,
            origin,
            path: vec![PathPart::Literal {
                literal: "search".to_string(),
            }],
            query: Some(std::collections::BTreeMap::from([(
                "q".to_string(),
                sovereign_edge_desktop_lib::connectors::manifest::ValueSource::Slot {
                    slot: "query".to_string(),
                },
            )])),
            headers: None,
            body: None,
        },
        response: ResponseTemplate {
            text_from: "results".to_string(),
            max_bytes: 1_000_000,
        },
    }
}

#[tokio::test]
async fn dispatches_a_real_request_over_real_tcp_and_maps_the_response() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("could not bind a local test server");
    let addr = listener.local_addr().expect("no local addr");
    serve_one_response(listener, r#"{"results":"chili recipes"}"#);

    let manifest = ConnectorManifest::Tier1(scratch_manifest(format!("http://{addr}")));

    let grants_dir = std::env::temp_dir().join(format!(
        "sovereign-edge-desktop-connector-dispatch-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    ));
    std::fs::create_dir_all(&grants_dir).expect("could not create scratch grants dir");
    permissions::grant(&grants_dir, &manifest);

    let client = sovereign_edge_desktop_lib::connectors::runtime::client();
    let result = execute_connector_call(
        &client,
        &manifest,
        &serde_json::json!({ "query": "chili" }),
        &grants_dir,
    )
    .await;

    match result {
        ExecutionResult::Ok { text } => assert_eq!(text, "chili recipes"),
        ExecutionResult::Err(failure) => {
            panic!("expected a successful round trip, got {failure:?}")
        }
    }
}
