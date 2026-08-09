//! Search connector setup (task 13.6), mirroring
//! `apps/mobile/src/connectors/search/` — real, user-entered config in
//! place of task 12.4's static fixture.

pub mod config;
pub mod manifest;

pub use config::{read_search_config, write_search_config, SearchConfig};
pub use manifest::{build_searxng_manifest, tavily_manifest, CONNECTOR_ID};
