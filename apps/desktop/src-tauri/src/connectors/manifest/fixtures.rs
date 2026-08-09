//! Fixture manifests shared with mobile (tasks 12.4, 12.5).
//!
//! `include_str!` of the literal file under `packages/connector-sdk/`
//! (relocated there from `apps/mobile/` by task 5.1), not a copy — this is
//! what makes "zero changes to the manifest itself" (the review checklist's
//! own defining bar) a build-time guarantee rather than a promise to keep
//! two files in sync by hand: editing this fixture edits the one file both
//! platforms share.

pub const SEARCH_MANIFEST_JSON: &str =
    include_str!("../../../../../../packages/connector-sdk/src/fixtures/search.manifest.json");

/// Tier 3's own proof-of-life fixture — see `runtime::native_handlers`'s
/// own doc comment for why `device.info` exists.
pub const DEVICE_INFO_MANIFEST_JSON: &str =
    include_str!("../../../../../../packages/connector-sdk/src/fixtures/device-info.manifest.json");
