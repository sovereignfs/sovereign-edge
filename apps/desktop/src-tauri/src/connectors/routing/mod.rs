//! Model-driven tool routing (task 12.7a), mirroring
//! `apps/mobile/src/connectors/routing/`.

pub mod route;
pub mod types;

pub use route::{route_message, GenerativeEngine, RouteOptions};
pub use types::{BlockedReason, RoutingDecision};
