//! Connector call result (task 12.4), mirroring
//! `apps/mobile/src/connectors/runtime/types.ts`.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FailureReason {
    NotPermitted,
    MissingCredential,
    InvalidArguments,
    NetworkError,
    Redirected,
    HttpError,
    ResponseTooLarge,
    MalformedResponse,
    /// Reserved for Tier 3 (task 12.5); also used for "Tier 3 dispatch
    /// isn't implemented yet" until then.
    HandlerError,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExecutionFailure {
    pub reason: FailureReason,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl ExecutionFailure {
    pub fn new(reason: FailureReason) -> Self {
        Self {
            reason,
            detail: None,
        }
    }

    pub fn with_detail(reason: FailureReason, detail: impl Into<String>) -> Self {
        Self {
            reason,
            detail: Some(detail.into()),
        }
    }
}

/// Mirrors `{ok:true,text} | {ok:false,reason,detail?}`. Plain `Debug`/
/// `Clone` only for now — no command serializes this over IPC yet (task
/// 12.4 has no frontend consumer, same call 12.3 made for its own vault);
/// add `Serialize` when one does, matching the `{ok, ...}` wire shape then.
#[derive(Debug, Clone)]
pub enum ExecutionResult {
    Ok { text: String },
    Err(ExecutionFailure),
}
