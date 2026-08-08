//! Routing decision shape (task 12.7a), mirroring
//! `apps/mobile/src/connectors/routing/types.ts`'s `RoutingDecision`.

use serde_json::Value;

/// What a single generation call decided, once tool-calling is in play.
/// See `route::route_message`'s own doc comment for how each variant is
/// reached.
#[derive(Debug, Clone)]
pub enum RoutingDecision {
    /// No connector call — either none were offered, or the model chose
    /// to answer directly.
    Answered { text: String },
    /// The model called a permitted connector's tool with arguments that
    /// parsed. The caller (`connectors::orchestration`) executes it.
    ToolCall {
        connector_id: String,
        tool_name: String,
        arguments: Value,
    },
    /// The model called a tool, but it can't be honored.
    Blocked {
        tool_name: String,
        reason: BlockedReason,
        /// `None` only for `NoConnector` — there's no connector to name.
        connector_id: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockedReason {
    /// The model called a tool name no offered manifest declares.
    NoConnector,
    /// A matching manifest exists, but it isn't granted.
    NotPermitted,
    /// The tool call's `arguments` didn't parse as JSON. The grammar
    /// (`engine::grammar`) constrains every token to be grammatically
    /// valid JSON, so this should be unreachable in practice — kept as a
    /// checked case anyway, the same "checked, not assumed" discipline
    /// mobile's own `route.ts` applies to this exact spot.
    Malformed,
}
