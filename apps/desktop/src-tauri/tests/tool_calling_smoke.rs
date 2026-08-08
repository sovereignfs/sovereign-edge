//! Task 12.7a's own review bar: a real on-device model, given a granted
//! Tier 1 connector, actually emits a grammar-constrained tool call — not
//! a mock, not a hand-built `GenerateResult` — and the reply comes back
//! tagged with the connector's name. This is the thing task 12.6's plan
//! flagged as needing a real check: "grammar-constrained decoding" is a
//! claim about actual model behavior under a sampler, not something a unit
//! test against a fake engine (see `connectors::orchestration`'s and
//! `connectors::routing::route`'s own `#[cfg(test)]` modules) can prove by
//! itself.
//!
//! `#[ignore]`d for the same reason `engine_smoke.rs` is: downloads a real
//! model on first run. Shares that test's model cache directory. Run it
//! explicitly:
//!
//! ```sh
//! cargo test --test tool_calling_smoke -- --ignored --nocapture
//! ```

use sovereign_edge_desktop_lib::connectors::manifest::{
    ConnectorManifest, ConnectorManifestTier1, HttpMethod, NetworkPermissions, PathPart, Pricing,
    RequestTemplate, ResponseTemplate, Tier1Permissions, ToolDefinition, ToolParameters,
};
use sovereign_edge_desktop_lib::connectors::orchestration::{
    generate_with_connectors, GenerateWithConnectorsOptions,
};
use sovereign_edge_desktop_lib::connectors::permissions;
use sovereign_edge_desktop_lib::connectors::runtime;
use sovereign_edge_desktop_lib::engine::{
    ChatMessage, EngineAdapter, LoadOptions, Role, ToolChoice,
};
use sovereign_edge_desktop_lib::models::{
    curated_models, download_model, models_directory, DownloadOptions,
};
use std::io::{Read, Write};
use std::net::TcpListener;

/// Same scratch manifest shape `connector_dispatch.rs` uses, pointed at a
/// local test server instead of `search.manifest.json`'s non-resolving
/// `searx.example.org` — for the same reason that test gives: a real
/// network round trip needs a real, dialable origin, and rewriting the
/// shared fixture to get one would contradict "zero changes to the
/// manifest itself."
fn search_manifest(origin: String) -> ConnectorManifest {
    ConnectorManifest::Tier1(ConnectorManifestTier1 {
        manifest_version: 1,
        id: "fs.sovereign.edge.tool-calling-smoke-search".to_string(),
        name: "Search".to_string(),
        version: "1.0.0".to_string(),
        summary: "Scratch manifest for task 12.7a's on-device tool-calling smoke test.".to_string(),
        tier: 1,
        platforms: vec![],
        tool: ToolDefinition {
            name: "search".to_string(),
            description: "Search the web for up-to-date information.".to_string(),
            parameters: ToolParameters {
                type_: "object".to_string(),
                properties: serde_json::Map::from_iter([(
                    "query".to_string(),
                    serde_json::json!({"type": "string", "description": "the search query"}),
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
    })
}

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

#[tokio::test]
#[ignore]
async fn a_granted_connector_is_called_and_the_reply_is_tagged() {
    let scratch = std::env::temp_dir().join("sovereign-edge-desktop-engine-smoke-models");
    let models_dir =
        models_directory(&scratch).expect("could not create the scratch models directory");
    let descriptor = curated_models()
        .into_iter()
        .min_by(|a, b| a.descriptor.size_bytes.cmp(&b.descriptor.size_bytes))
        .expect("catalog is non-empty")
        .descriptor;

    eprintln!("downloading/verifying {}...", descriptor.name);
    let client = reqwest::Client::new();
    let model_path = download_model(
        &client,
        &models_dir,
        &descriptor,
        DownloadOptions::default(),
    )
    .await
    .expect("model download+verification failed");

    let listener = TcpListener::bind("127.0.0.1:0").expect("could not bind test server");
    let addr = listener.local_addr().expect("no local addr");
    serve_one_response(
        listener,
        r#"{"results":"Chili is best made with dried ancho and guajillo peppers."}"#,
    );

    let manifest = search_manifest(format!("http://{addr}"));
    let grants_dir = scratch.join("connectors-grants");
    std::fs::create_dir_all(&grants_dir).expect("could not create scratch grants dir");
    permissions::grant(&grants_dir, &manifest);

    let outcome = tokio::task::spawn_blocking(move || {
        let mut engine = EngineAdapter::new().expect("could not initialize the inference backend");
        let info = engine
            .load(LoadOptions {
                model_path,
                context_size: 2048,
                use_gpu: true,
            })
            .expect("model load failed");
        eprintln!("loaded: tool_capable={}", info.tool_capable);

        let messages = vec![ChatMessage {
            role: Role::User,
            content:
                "What's the best kind of chili pepper for chili? Use the search tool to find out."
                    .to_string(),
        }];

        let result = generate_with_connectors(
            &mut engine,
            &runtime::client(),
            &grants_dir,
            &[manifest],
            messages,
            GenerateWithConnectorsOptions {
                temperature: 0.7,
                max_tokens: 128,
                // Forced rather than left to the model's own judgment —
                // this test is verifying the grammar-constrained tool-call
                // *mechanism* works on a real model, not testing whether a
                // 0.5B model reliably chooses to use tools unprompted.
                // `route::tests::required_tool_choice_omits_the_answer_alternative`
                // already covers that `Required` reaches the grammar
                // builder correctly; this is the on-device half of that.
                tool_choice: ToolChoice::Required,
                on_token: None,
                cancel: None,
            },
        )
        .expect("generate_with_connectors failed");

        engine.unload();
        result
    })
    .await
    .expect("engine thread panicked");

    eprintln!("connector={:?} reply={:?}", outcome.connector, outcome.text);

    assert_eq!(
        outcome.connector.as_deref(),
        Some("Search"),
        "expected the reply to be tagged with the connector that answered it, got: {outcome:?}"
    );
    assert!(
        !outcome.text.trim().is_empty(),
        "expected a non-empty final answer, got: {outcome:?}"
    );
}
