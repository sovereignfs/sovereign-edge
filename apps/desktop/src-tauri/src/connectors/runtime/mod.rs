//! Tier 1 connector runtime dispatch (task 12.4), mirroring
//! `apps/mobile/src/connectors/runtime/`.

pub mod execute;
pub mod types;

pub use execute::{build_request, client, execute_connector_call, map_response};
pub use types::{ExecutionFailure, ExecutionResult, FailureReason};
