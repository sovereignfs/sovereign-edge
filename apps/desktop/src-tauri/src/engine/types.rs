//! Inference engine types (task 12.2, mirroring
//! `apps/mobile/src/chat/inference/types.ts`).
//!
//! This layer is deliberately free of network types, same as mobile: by the
//! time anything here runs, the model file is already on disk, put there by
//! `crate::models`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// A message in the conversation, in the shape the chat template expects.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::System => "system",
            Role::User => "user",
            Role::Assistant => "assistant",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct LoadOptions {
    /// Absolute path to a GGUF file already on disk.
    pub model_path: PathBuf,
    /// Context window in tokens. Larger costs memory; 2048 is a safe default.
    pub context_size: u32,
    /// Try to use the GPU (Metal on macOS; CPU-only elsewhere for now — see
    /// `Cargo.toml`'s target-gated `llama-cpp-2` features). Falls back to
    /// CPU silently when unavailable — check `EngineInfo.gpu` for what
    /// happened.
    pub use_gpu: bool,
}

impl Default for LoadOptions {
    fn default() -> Self {
        Self {
            model_path: PathBuf::new(),
            context_size: 2048,
            use_gpu: true,
        }
    }
}

/// A tool the model may call, in the shape `engine::grammar` and
/// `connectors::routing` both need. Mirrors mobile's `ToolDefinition`
/// (`chat/inference/types.ts`) minus the OpenAI `type: 'function'`
/// envelope — nothing here needs it, since this engine's tool-calling
/// protocol (see `engine::grammar`'s doc comment) isn't OpenAI's wire
/// format to begin with.
#[derive(Debug, Clone, Serialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    /// JSON Schema. See `engine::grammar`'s doc comment for the subset
    /// `build_decision_grammar` actually supports.
    pub parameters: serde_json::Value,
}

/// Whether the model must call one of the offered tools or may answer
/// directly. Mirrors mobile's `toolChoice: string` (`'auto' | 'required'`
/// in practice), typed here instead of left as a bare string since this
/// engine only ever recognizes these two values.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolChoice {
    Auto,
    Required,
}

pub struct GenerateOptions {
    pub messages: Vec<ChatMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
    /// Sequences that end generation early.
    pub stop: Vec<String>,
    /// Tools the model may call. Empty means plain, unconstrained
    /// generation — the same code path this engine has always had.
    pub tools: Vec<ToolDefinition>,
    /// Only consulted when `tools` is non-empty.
    pub tool_choice: ToolChoice,
}

impl Default for GenerateOptions {
    fn default() -> Self {
        Self {
            messages: Vec::new(),
            max_tokens: 512,
            temperature: 0.7,
            stop: Vec::new(),
            tools: Vec::new(),
            tool_choice: ToolChoice::Auto,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum StopReason {
    Eos,
    Length,
    StopSequence,
    Aborted,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub text: String,
    pub stop_reason: StopReason,
    pub tokens_generated: u32,
    /// Milliseconds until the first token appeared — the prompt-processing
    /// (prefill) cost, reported separately because folding it into the rate
    /// below badly distorts short replies. `None` if no token was produced.
    pub time_to_first_token_ms: Option<u64>,
    /// Tokens per second measured from the first token onward.
    pub tokens_per_second: Option<f64>,
    /// Tool calling (mobile's task 2.3 equivalent) is out of scope for this
    /// task — always empty. The field stays on the struct so wiring it in
    /// later needs no shape change, mirroring mobile's own `toolCalls`.
    pub tool_calls: Vec<ToolCall>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolCall {
    pub name: String,
    pub arguments: String,
}

/// What actually got loaded — reported after load, not assumed beforehand.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub gpu: bool,
    pub reason_no_gpu: Option<String>,
    pub context_size: u32,
    /// Always `false` for now — see `GenerateResult::tool_calls`.
    pub tool_capable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum InferenceErrorCode {
    /// The GGUF file is missing, unreadable, or not a valid model.
    ModelLoadFailed,
    /// Generation was attempted with no model loaded.
    NoModelLoaded,
    /// The engine ran out of memory — the common failure on real machines.
    OutOfMemory,
    /// Generation itself failed.
    GenerationFailed,
}

#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct InferenceError {
    pub code: InferenceErrorCode,
    pub message: String,
}

impl InferenceError {
    pub fn new(code: InferenceErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl Serialize for InferenceError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("InferenceError", 2)?;
        s.serialize_field("code", &self.code)?;
        s.serialize_field("message", &self.message)?;
        s.end()
    }
}
