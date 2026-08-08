//! Connector-aware generation (task 12.7a), mirroring
//! `apps/mobile/src/settings/connectorOrchestration.ts`'s
//! `generateWithConnectors` — the one place a [`RoutingDecision`] and an
//! [`ExecutionResult`] meet a user-facing reply.
//!
//! Never returns an `Err` for a routing or execution failure — those
//! become an honest, specific reply `text` explaining what happened,
//! ported message-for-message from mobile's own `blockedMessage`/
//! `executionFailureMessage`. An `Err` here means an engine/programming
//! fault, not a connector saying no.

use super::manifest::ConnectorManifest;
use super::routing::{
    route_message, BlockedReason, GenerativeEngine, RouteOptions, RoutingDecision,
};
use super::runtime::{execute_connector_call, ExecutionFailure, ExecutionResult, FailureReason};
use crate::engine::{ChatMessage, InferenceError, ToolChoice};
use std::path::Path;
use std::sync::mpsc::Sender;
use tokio_util::sync::CancellationToken;

/// What a chat turn resolved to. Mirrors mobile's
/// `ConnectorOrchestrationResult`.
#[derive(Debug, Clone)]
pub struct ChatGenerateResult {
    pub text: String,
    /// Name of the connector whose data is in this reply. `None` whenever
    /// the reply came entirely from the local model — including a blocked
    /// or failed connector attempt, which explains itself in `text`
    /// rather than being tagged as if a connector had actually answered.
    pub connector: Option<String>,
}

pub struct GenerateWithConnectorsOptions {
    pub temperature: f32,
    pub max_tokens: u32,
    /// `Auto` lets the model decide whether a tool is needed. `Required`
    /// is chat's explicit Search-mode knob — the user's mode selection is
    /// the decision, not something asked of the model.
    pub tool_choice: ToolChoice,
    pub on_token: Option<Sender<String>>,
    pub cancel: Option<CancellationToken>,
}

/// Character budget for a connector's result once folded into the
/// follow-up prompt. `response.max_bytes` (task 12.4) caps what the
/// *network* hands back, generous enough to protect against a
/// misbehaving endpoint but not to fit a model's context window —
/// mobile's own comment on this constant documents finding that gap
/// on-device against a real SearXNG response, not by reasoning about it
/// in advance.
const CONNECTOR_RESULT_CHAR_BUDGET: usize = 2_000;

fn truncate_for_context(text: &str) -> String {
    if text.chars().count() <= CONNECTOR_RESULT_CHAR_BUDGET {
        return text.to_string();
    }
    let truncated: String = text.chars().take(CONNECTOR_RESULT_CHAR_BUDGET).collect();
    format!("{truncated}…")
}

fn connector_name(manifests: &[ConnectorManifest], id: Option<&str>) -> String {
    id.and_then(|id| manifests.iter().find(|m| m.id() == id))
        .map(|m| m.name().to_string())
        .unwrap_or_else(|| "that connector".to_string())
}

fn blocked_message(
    reason: BlockedReason,
    connector_id: Option<&str>,
    manifests: &[ConnectorManifest],
) -> String {
    match reason {
        BlockedReason::NotPermitted => format!(
            "This would use {}, which hasn't been granted access. Open Settings → Connectors to allow it.",
            connector_name(manifests, connector_id)
        ),
        BlockedReason::NoConnector => {
            "That doesn't match anything this app currently has a connector for.".to_string()
        }
        BlockedReason::Malformed => {
            "That didn't come back in a shape this app could use. Try asking again.".to_string()
        }
    }
}

fn execution_failure_message(failure: &ExecutionFailure, name: &str) -> String {
    match failure.reason {
        FailureReason::NotPermitted => format!(
            "This would use {name}, which hasn't been granted access. Open Settings → Connectors to allow it."
        ),
        FailureReason::MissingCredential => {
            format!("{name} needs a credential that hasn't been set up yet.")
        }
        FailureReason::InvalidArguments => {
            format!("That request to {name} couldn't be built from what was asked. Try rephrasing.")
        }
        FailureReason::NetworkError => format!("Couldn't reach {name} right now."),
        FailureReason::Redirected => {
            format!("{name} tried to redirect the request, so it was refused for safety.")
        }
        FailureReason::HttpError => format!("{name} returned an error."),
        FailureReason::ResponseTooLarge => format!("{name}'s response was too large to use."),
        FailureReason::MalformedResponse => {
            format!("{name}'s response wasn't in a shape this app could use.")
        }
        FailureReason::HandlerError => format!("{name} couldn't complete that action."),
    }
}

/// Routes `messages`, executes a connector if the model called one, and
/// returns a reply plus which connector (if any) produced it. Blocks the
/// calling thread for the connector's HTTP round trip
/// (`tauri::async_runtime::block_on`) — safe here because every caller
/// (see `lib.rs`'s `generate_chat`) runs this from Tauri's blocking
/// thread pool, never from the async reactor thread.
pub fn generate_with_connectors(
    engine: &mut impl GenerativeEngine,
    http_client: &reqwest::Client,
    grants_dir: &Path,
    manifests: &[ConnectorManifest],
    messages: Vec<ChatMessage>,
    options: GenerateWithConnectorsOptions,
) -> Result<ChatGenerateResult, InferenceError> {
    // Forcing a tool call with nothing to call is nonsensical, and would
    // otherwise reach `route_message`'s own "nothing offered" branch and
    // answer in the model's own voice — exactly the silent, ambiguous
    // outcome Search mode exists to remove. Caught before any generation.
    if options.tool_choice == ToolChoice::Required && manifests.is_empty() {
        return Ok(ChatGenerateResult {
            text: "Search isn't set up yet. Open Settings → Connectors → Search to configure one."
                .to_string(),
            connector: None,
        });
    }

    // Cloned rather than moved: a successful `ToolCall` decision reuses
    // both for the follow-up generate call below, mirroring mobile's own
    // `onToken`/`signal` being forwarded to *both* the routing call and
    // the final answer.
    let on_token_for_final = options.on_token.clone();
    let cancel_for_final = options.cancel.clone();

    let decision = route_message(
        engine,
        grants_dir,
        manifests,
        messages.clone(),
        RouteOptions {
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            tool_choice: options.tool_choice,
            on_token: options.on_token,
            cancel: options.cancel,
        },
    )?;

    match decision {
        RoutingDecision::Answered { text } => Ok(ChatGenerateResult {
            text,
            connector: None,
        }),

        RoutingDecision::Blocked {
            reason,
            connector_id,
            ..
        } => Ok(ChatGenerateResult {
            text: blocked_message(reason, connector_id.as_deref(), manifests),
            connector: None,
        }),

        RoutingDecision::ToolCall {
            connector_id,
            arguments,
            ..
        } => {
            let Some(manifest) = manifests.iter().find(|m| m.id() == connector_id) else {
                // `route_message` only ever names a connector from the
                // list it was given, so this is unreachable in
                // practice — narrowed defensively rather than asserted
                // past, the same call mobile's own comment here makes.
                return Ok(ChatGenerateResult {
                    text: "That doesn't match anything this app currently has a connector for."
                        .to_string(),
                    connector: None,
                });
            };

            let execution = tauri::async_runtime::block_on(execute_connector_call(
                http_client,
                manifest,
                &arguments,
                grants_dir,
            ));

            let result_text = match execution {
                ExecutionResult::Ok { text } => text,
                ExecutionResult::Err(failure) => {
                    return Ok(ChatGenerateResult {
                        text: execution_failure_message(&failure, manifest.name()),
                        connector: None,
                    })
                }
            };

            // Not stored in `messages` and never sent again next turn —
            // the connector's raw result is context for this one answer,
            // not part of the visible or remembered conversation.
            let mut follow_up = messages;
            follow_up.push(ChatMessage {
                role: crate::engine::Role::System,
                content: format!(
                    "Result from {}: {}\n\nAnswer the user's question using this information.",
                    manifest.name(),
                    truncate_for_context(&result_text)
                ),
            });

            let final_result = engine.generate(
                crate::engine::GenerateOptions {
                    messages: follow_up,
                    max_tokens: options.max_tokens,
                    temperature: options.temperature,
                    ..Default::default()
                },
                on_token_for_final,
                cancel_for_final,
            )?;

            Ok(ChatGenerateResult {
                text: final_result.text,
                connector: Some(manifest.name().to_string()),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::manifest::{
        ConnectorManifestTier1, HttpMethod, NetworkPermissions, PathPart, Pricing, RequestTemplate,
        ResponseTemplate, Tier1Permissions, ToolDefinition as ManifestTool, ToolParameters,
    };
    use crate::engine::{GenerateOptions, GenerateResult, Role, StopReason, ToolCall};
    use std::collections::VecDeque;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    struct FakeEngine {
        responses: VecDeque<Result<GenerateResult, InferenceError>>,
    }

    impl FakeEngine {
        fn returning(responses: Vec<Result<GenerateResult, InferenceError>>) -> Self {
            Self {
                responses: responses.into(),
            }
        }

        fn empty() -> Self {
            Self::returning(Vec::new())
        }
    }

    impl GenerativeEngine for FakeEngine {
        fn generate(
            &mut self,
            _options: GenerateOptions,
            _on_token: Option<Sender<String>>,
            _cancel: Option<CancellationToken>,
        ) -> Result<GenerateResult, InferenceError> {
            self.responses
                .pop_front()
                .expect("FakeEngine ran out of canned responses")
        }
    }

    fn answer(text: &str) -> Result<GenerateResult, InferenceError> {
        Ok(GenerateResult {
            text: text.to_string(),
            stop_reason: StopReason::Eos,
            tokens_generated: 1,
            time_to_first_token_ms: None,
            tokens_per_second: None,
            tool_calls: Vec::new(),
        })
    }

    fn tool_call(name: &str, arguments: &str) -> Result<GenerateResult, InferenceError> {
        Ok(GenerateResult {
            text: String::new(),
            stop_reason: StopReason::Eos,
            tokens_generated: 1,
            time_to_first_token_ms: None,
            tokens_per_second: None,
            tool_calls: vec![ToolCall {
                name: name.to_string(),
                arguments: arguments.to_string(),
            }],
        })
    }

    fn search_manifest(origin: String) -> ConnectorManifest {
        ConnectorManifest::Tier1(ConnectorManifestTier1 {
            manifest_version: 1,
            id: "fs.sovereign.edge.orchestration-test-search".to_string(),
            name: "Search".to_string(),
            version: "1.0.0".to_string(),
            summary: "Scratch manifest for orchestration unit tests.".to_string(),
            tier: 1,
            platforms: vec![],
            tool: ManifestTool {
                name: "search".to_string(),
                description: "Search the web.".to_string(),
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
                query: None,
                headers: None,
                body: None,
            },
            response: ResponseTemplate {
                text_from: "results".to_string(),
                max_bytes: 1_000_000,
            },
        })
    }

    fn scratch_grants_dir(label: &str) -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-orchestration-test-{label}-{}-{n}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("could not create scratch grants dir");
        dir
    }

    fn user_message() -> Vec<ChatMessage> {
        vec![ChatMessage {
            role: Role::User,
            content: "search for chili recipes".to_string(),
        }]
    }

    fn base_options() -> GenerateWithConnectorsOptions {
        GenerateWithConnectorsOptions {
            temperature: 0.7,
            max_tokens: 64,
            tool_choice: ToolChoice::Auto,
            on_token: None,
            cancel: None,
        }
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

    #[test]
    fn required_with_no_manifests_short_circuits_before_any_generation() {
        // `FakeEngine::empty()` panics if `generate` is ever called — this
        // asserts the "nothing to require" check happens before any
        // completion call, mirroring mobile's own early return.
        let mut engine = FakeEngine::empty();
        let grants_dir = scratch_grants_dir("required-empty");
        let mut options = base_options();
        options.tool_choice = ToolChoice::Required;

        let result = generate_with_connectors(
            &mut engine,
            &crate::connectors::runtime::client(),
            &grants_dir,
            &[],
            user_message(),
            options,
        )
        .unwrap();

        assert!(result.connector.is_none());
        assert!(result.text.contains("Search isn't set up yet"));
    }

    #[test]
    fn blocked_decision_produces_explanatory_text_with_no_connector_tag() {
        // Only one canned response: if the blocked branch wrongly tried a
        // second `generate` call, `FakeEngine` would panic on an empty
        // queue rather than silently succeeding.
        let mut engine = FakeEngine::returning(vec![tool_call("search", r#"{"query":"chili"}"#)]);
        let grants_dir = scratch_grants_dir("blocked");
        let manifest = search_manifest("https://searx.example.org".to_string());

        let result = generate_with_connectors(
            &mut engine,
            &crate::connectors::runtime::client(),
            &grants_dir,
            &[manifest],
            user_message(),
            base_options(),
        )
        .unwrap();

        assert!(result.connector.is_none());
        assert!(result.text.contains("Search"));
        assert!(result.text.contains("hasn't been granted access"));
    }

    #[test]
    fn successful_tool_call_executes_and_tags_the_reply_with_the_connector_name() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("could not bind test server");
        let addr = listener.local_addr().expect("no local addr");
        serve_one_response(listener, r#"{"results":"chili recipes"}"#);

        let manifest = search_manifest(format!("http://{addr}"));
        let grants_dir = scratch_grants_dir("tool-call-success");
        crate::connectors::permissions::grant(&grants_dir, &manifest);

        let mut engine = FakeEngine::returning(vec![
            tool_call("search", r#"{"query":"chili"}"#),
            answer("Here are some chili recipes."),
        ]);

        let result = generate_with_connectors(
            &mut engine,
            &crate::connectors::runtime::client(),
            &grants_dir,
            &[manifest],
            user_message(),
            base_options(),
        )
        .unwrap();

        assert_eq!(result.text, "Here are some chili recipes.");
        // The connector's own display name ("Search"), not the tool
        // function name ("search") the model called — the exact
        // distinction `ConnectorManifest::name()` vs. `::tool().name`
        // exists to keep straight.
        assert_eq!(result.connector.as_deref(), Some("Search"));
    }

    #[test]
    fn execution_failure_falls_back_to_local_answer_with_no_connector_tag() {
        // Nothing is listening on this port — the connector call fails
        // with a network error, and only one canned response is given, so
        // a second `generate` call (which the mobile source deliberately
        // does *not* make on failure) would panic the fake.
        let unused_port_manifest = search_manifest("http://127.0.0.1:1".to_string());
        let grants_dir = scratch_grants_dir("execution-failure");
        crate::connectors::permissions::grant(&grants_dir, &unused_port_manifest);

        let mut engine = FakeEngine::returning(vec![tool_call("search", r#"{"query":"chili"}"#)]);

        let result = generate_with_connectors(
            &mut engine,
            &crate::connectors::runtime::client(),
            &grants_dir,
            &[unused_port_manifest],
            user_message(),
            base_options(),
        )
        .unwrap();

        assert!(result.connector.is_none());
        assert!(result.text.contains("Search"));
    }
}
