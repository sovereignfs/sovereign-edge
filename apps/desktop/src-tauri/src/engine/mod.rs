//! On-device inference (task 12.2), mirroring `apps/mobile/src/chat/inference/`.

pub mod adapter;
pub mod grammar;
pub mod types;

pub use adapter::EngineAdapter;
// Re-exported for shape-completeness of the module's public surface (e.g.
// task 12.7's future chat UI will need `Role`/`StopReason` to build
// requests and interpret results) even though nothing in this crate
// references them by this path yet.
#[allow(unused_imports)]
pub use types::{
    ChatMessage, EngineInfo, GenerateOptions, GenerateResult, InferenceError, InferenceErrorCode,
    LoadOptions, Role, StopReason, ToolCall, ToolChoice, ToolDefinition,
};
