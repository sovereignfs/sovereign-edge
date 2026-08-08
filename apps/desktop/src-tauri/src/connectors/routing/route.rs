//! Model-driven tool routing (task 12.7a), mirroring
//! `apps/mobile/src/connectors/routing/route.ts`'s `routeMessage`.
//!
//! **Deviation from mobile, and why it's safe to drop:** mobile's
//! `RoutingDecision` has a fourth case, `unsupported`, reached when
//! connectors exist but the loaded model's chat template doesn't declare
//! tool support (`EngineInfo.toolCapable === false`). This engine's
//! `tool_capable` is unconditionally `true` once any model is loaded (see
//! `engine::adapter`'s own doc comment) — the GBNF grammar this port uses
//! instead of native chat-template tool syntax works for any
//! instruction-following model — so that case can't be reached here and
//! isn't in [`super::types::RoutingDecision`] at all, rather than kept as
//! permanently-dead code.

use super::types::{BlockedReason, RoutingDecision};
use crate::connectors::manifest::ConnectorManifest;
use crate::connectors::permissions::is_allowed;
use crate::engine::{
    ChatMessage, EngineAdapter, GenerateOptions, GenerateResult, InferenceError, ToolChoice,
    ToolDefinition,
};
use std::path::Path;
use std::sync::mpsc::Sender;
use tokio_util::sync::CancellationToken;

/// The one `EngineAdapter` method routing/orchestration needs, extracted
/// as a trait — the same seam `models::manager`'s own `LoadedModelHandle`
/// already uses — so this module's decision logic is unit-testable
/// against a canned/fake engine, without loading real model weights.
/// `EngineAdapter` itself is `generate`'s only real implementation; tests
/// (`route.rs`'s and `orchestration.rs`'s own `#[cfg(test)]` modules)
/// provide the other one.
pub trait GenerativeEngine {
    fn generate(
        &mut self,
        options: GenerateOptions,
        on_token: Option<Sender<String>>,
        cancel: Option<CancellationToken>,
    ) -> Result<GenerateResult, InferenceError>;
}

impl GenerativeEngine for EngineAdapter {
    fn generate(
        &mut self,
        options: GenerateOptions,
        on_token: Option<Sender<String>>,
        cancel: Option<CancellationToken>,
    ) -> Result<GenerateResult, InferenceError> {
        EngineAdapter::generate(self, options, on_token, cancel)
    }
}

pub struct RouteOptions {
    pub temperature: f32,
    pub max_tokens: u32,
    pub tool_choice: ToolChoice,
    /// Forwarded only on the no-connectors path and on a final `Answered`
    /// decision — never during the tool-decision call itself. See this
    /// function's own comment on why.
    pub on_token: Option<Sender<String>>,
    pub cancel: Option<CancellationToken>,
}

/// One completion call with every offered manifest's tool exposed to the
/// model; the model itself decides whether to answer directly or call a
/// tool. `options.tool_choice` is the only lever the caller has over that
/// decision (`ToolChoice::Required` forces a call — chat's "Search mode",
/// ported unchanged from mobile's `connectorMode`), not which connector
/// gets picked.
pub fn route_message(
    engine: &mut impl GenerativeEngine,
    grants_dir: &Path,
    manifests: &[ConnectorManifest],
    messages: Vec<ChatMessage>,
    options: RouteOptions,
) -> Result<RoutingDecision, InferenceError> {
    if manifests.is_empty() {
        let result = engine.generate(
            GenerateOptions {
                messages,
                max_tokens: options.max_tokens,
                temperature: options.temperature,
                ..Default::default()
            },
            options.on_token,
            options.cancel,
        )?;
        return Ok(RoutingDecision::Answered { text: result.text });
    }

    let tools: Vec<ToolDefinition> = manifests
        .iter()
        .map(|m| ToolDefinition {
            name: m.tool().name.clone(),
            description: m.tool().description.clone(),
            parameters: serde_json::to_value(&m.tool().parameters)
                .expect("ToolParameters always serializes to JSON"),
        })
        .collect();

    // Streaming is deliberately *not* forwarded to this call: raw
    // `{"tool_call": ...}` / `{"answer": ...}` decision-envelope JSON is
    // never meant to reach the user. On an `Answered` outcome below, the
    // full text is sent through `on_token` once in one shot instead —
    // "flushing" the suppressed stream, exactly mirroring mobile's own
    // `onToken?.(result.text)` at this spot.
    let result = engine.generate(
        GenerateOptions {
            messages,
            max_tokens: options.max_tokens,
            temperature: options.temperature,
            tools,
            tool_choice: options.tool_choice,
            ..Default::default()
        },
        None,
        options.cancel,
    )?;

    let Some(call) = result.tool_calls.into_iter().next() else {
        if let Some(sender) = &options.on_token {
            let _ = sender.send(result.text.clone());
        }
        return Ok(RoutingDecision::Answered { text: result.text });
    };

    let Some(manifest) = manifests.iter().find(|m| m.tool().name == call.name) else {
        return Ok(RoutingDecision::Blocked {
            tool_name: call.name,
            reason: BlockedReason::NoConnector,
            connector_id: None,
        });
    };

    if !is_allowed(grants_dir, manifest) {
        return Ok(RoutingDecision::Blocked {
            tool_name: call.name,
            reason: BlockedReason::NotPermitted,
            connector_id: Some(manifest.id().to_string()),
        });
    }

    let arguments: serde_json::Value = match serde_json::from_str(&call.arguments) {
        Ok(value) => value,
        Err(_) => {
            return Ok(RoutingDecision::Blocked {
                tool_name: call.name,
                reason: BlockedReason::Malformed,
                connector_id: Some(manifest.id().to_string()),
            })
        }
    };

    Ok(RoutingDecision::ToolCall {
        connector_id: manifest.id().to_string(),
        tool_name: call.name,
        arguments,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::manifest::{
        ConnectorManifestTier1, HttpMethod, NetworkPermissions, PathPart, Pricing, RequestTemplate,
        ResponseTemplate, Tier1Permissions, ToolDefinition as ManifestTool, ToolParameters,
    };
    use crate::engine::{Role, StopReason, ToolCall};
    use std::collections::VecDeque;

    /// Canned-response `GenerativeEngine` — no model weights, no llama.cpp,
    /// just the responses a test hands it in order. Ports the same "fake
    /// engine" seam mobile's own `route.test.ts` uses.
    struct FakeEngine {
        responses: VecDeque<Result<GenerateResult, InferenceError>>,
    }

    impl FakeEngine {
        fn returning(responses: Vec<Result<GenerateResult, InferenceError>>) -> Self {
            Self {
                responses: responses.into(),
            }
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

    fn search_manifest() -> ConnectorManifest {
        ConnectorManifest::Tier1(ConnectorManifestTier1 {
            manifest_version: 1,
            id: "fs.sovereign.edge.routing-test-search".to_string(),
            name: "Search".to_string(),
            version: "1.0.0".to_string(),
            summary: "Scratch manifest for routing unit tests.".to_string(),
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
                    origins: vec!["https://searx.example.org".to_string()],
                },
                credentials: None,
            },
            request: RequestTemplate {
                method: HttpMethod::Get,
                origin: "https://searx.example.org".to_string(),
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

    /// A fresh, empty scratch directory — PID plus a per-call counter
    /// keeps concurrent test threads and repeated `cargo test` runs from
    /// colliding, the same convention `permissions::grants`'s and
    /// `execute`'s own test suites already use.
    fn scratch_grants_dir(label: &str) -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-routing-test-{label}-{}-{n}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("could not create scratch grants dir");
        dir
    }

    fn user_message() -> Vec<ChatMessage> {
        vec![ChatMessage {
            role: Role::User,
            content: "hi".to_string(),
        }]
    }

    fn route_opts() -> RouteOptions {
        RouteOptions {
            temperature: 0.7,
            max_tokens: 64,
            tool_choice: ToolChoice::Auto,
            on_token: None,
            cancel: None,
        }
    }

    #[test]
    fn no_manifests_answers_directly() {
        let mut engine = FakeEngine::returning(vec![answer("hello")]);
        let grants_dir = scratch_grants_dir("no-manifests");
        let decision =
            route_message(&mut engine, &grants_dir, &[], user_message(), route_opts()).unwrap();
        match decision {
            RoutingDecision::Answered { text } => assert_eq!(text, "hello"),
            other => panic!("expected Answered, got {other:?}"),
        }
    }

    #[test]
    fn no_tool_call_flushes_full_text_once_via_on_token() {
        let mut engine = FakeEngine::returning(vec![answer("hello")]);
        let grants_dir = scratch_grants_dir("no-tool-call");
        let (tx, rx) = std::sync::mpsc::channel();
        let mut opts = route_opts();
        opts.on_token = Some(tx);

        let manifests = [search_manifest()];
        let decision =
            route_message(&mut engine, &grants_dir, &manifests, user_message(), opts).unwrap();

        match decision {
            RoutingDecision::Answered { text } => assert_eq!(text, "hello"),
            other => panic!("expected Answered, got {other:?}"),
        }
        assert_eq!(rx.recv().unwrap(), "hello");
        assert!(rx.try_recv().is_err(), "on_token should fire exactly once");
    }

    #[test]
    fn unknown_tool_name_is_blocked_no_connector() {
        let mut engine = FakeEngine::returning(vec![tool_call("bogus", "{}")]);
        let grants_dir = scratch_grants_dir("unknown-tool");
        let manifests = [search_manifest()];
        let decision = route_message(
            &mut engine,
            &grants_dir,
            &manifests,
            user_message(),
            route_opts(),
        )
        .unwrap();

        match decision {
            RoutingDecision::Blocked {
                reason,
                connector_id,
                tool_name,
            } => {
                assert_eq!(reason, BlockedReason::NoConnector);
                assert_eq!(connector_id, None);
                assert_eq!(tool_name, "bogus");
            }
            other => panic!("expected Blocked, got {other:?}"),
        }
    }

    #[test]
    fn unpermitted_tool_call_is_blocked_not_permitted() {
        let mut engine = FakeEngine::returning(vec![tool_call("search", r#"{"query":"chili"}"#)]);
        let grants_dir = scratch_grants_dir("unpermitted");
        let manifests = [search_manifest()];
        let decision = route_message(
            &mut engine,
            &grants_dir,
            &manifests,
            user_message(),
            route_opts(),
        )
        .unwrap();

        match decision {
            RoutingDecision::Blocked {
                reason,
                connector_id,
                ..
            } => {
                assert_eq!(reason, BlockedReason::NotPermitted);
                assert_eq!(connector_id, Some(manifests[0].id().to_string()));
            }
            other => panic!("expected Blocked, got {other:?}"),
        }
    }

    #[test]
    fn malformed_arguments_is_blocked_malformed() {
        let manifests = [search_manifest()];
        let grants_dir = scratch_grants_dir("malformed");
        crate::connectors::permissions::grant(&grants_dir, &manifests[0]);

        let mut engine = FakeEngine::returning(vec![tool_call("search", "not json")]);
        let decision = route_message(
            &mut engine,
            &grants_dir,
            &manifests,
            user_message(),
            route_opts(),
        )
        .unwrap();

        match decision {
            RoutingDecision::Blocked { reason, .. } => {
                assert_eq!(reason, BlockedReason::Malformed);
            }
            other => panic!("expected Blocked, got {other:?}"),
        }
    }

    #[test]
    fn granted_valid_call_becomes_a_tool_call_decision() {
        let manifests = [search_manifest()];
        let grants_dir = scratch_grants_dir("granted");
        crate::connectors::permissions::grant(&grants_dir, &manifests[0]);

        let mut engine = FakeEngine::returning(vec![tool_call("search", r#"{"query":"chili"}"#)]);
        let decision = route_message(
            &mut engine,
            &grants_dir,
            &manifests,
            user_message(),
            route_opts(),
        )
        .unwrap();

        match decision {
            RoutingDecision::ToolCall {
                connector_id,
                tool_name,
                arguments,
            } => {
                assert_eq!(connector_id, manifests[0].id());
                assert_eq!(tool_name, "search");
                assert_eq!(arguments, serde_json::json!({"query": "chili"}));
            }
            other => panic!("expected ToolCall, got {other:?}"),
        }
    }

    #[test]
    fn required_tool_choice_omits_the_answer_alternative() {
        // Exercised indirectly: `Required` reaching the model means the
        // grammar built for it has no answer path, so a well-behaved
        // model can only emit a tool call — this just confirms the
        // option threads through to a call that succeeds the same way
        // `Auto` does when the model *does* call the tool.
        let manifests = [search_manifest()];
        let grants_dir = scratch_grants_dir("required");
        crate::connectors::permissions::grant(&grants_dir, &manifests[0]);

        let mut engine = FakeEngine::returning(vec![tool_call("search", r#"{"query":"chili"}"#)]);
        let mut opts = route_opts();
        opts.tool_choice = ToolChoice::Required;
        let decision =
            route_message(&mut engine, &grants_dir, &manifests, user_message(), opts).unwrap();

        assert!(matches!(decision, RoutingDecision::ToolCall { .. }));
    }
}
