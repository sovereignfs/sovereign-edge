//! Connector runtime dispatch, both tiers (tasks 12.4, 12.5), mirroring
//! `apps/mobile/src/connectors/runtime/`.

pub mod execute;
pub mod native_handlers;
pub mod types;

pub use execute::{build_request, client, execute_connector_call, map_response};
pub use native_handlers::{native_handler_for, NativeHandler};
pub use types::{ExecutionFailure, ExecutionResult, FailureReason};
