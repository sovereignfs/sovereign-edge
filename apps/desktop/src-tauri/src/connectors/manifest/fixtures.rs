//! Fixture manifests shared with mobile (task 12.4).
//!
//! `include_str!` of the literal file under `apps/mobile/`, not a copy —
//! this is what makes "zero changes to the manifest itself" (the review
//! checklist's own defining bar) a build-time guarantee rather than a
//! promise to keep two files in sync by hand: editing this fixture edits
//! the one file both platforms share.

pub const SEARCH_MANIFEST_JSON: &str =
    include_str!("../../../../../mobile/src/connectors/manifest/fixtures/search.manifest.json");
