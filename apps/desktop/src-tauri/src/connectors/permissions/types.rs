//! Grant record types (task 12.4), mirroring
//! `apps/mobile/src/connectors/permissions/types.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GrantState {
    /// Absence of a decision, not a refusal — lets the UI avoid re-prompting
    /// for something already turned down while still distinguishing it from
    /// a real denial.
    NotAsked,
    Granted,
    /// Covers both an explicit refusal and a revocation — kept distinct
    /// from `NotAsked` so the UI doesn't re-prompt for either.
    Denied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorGrant {
    pub connector_id: String,
    pub state: GrantState,
    pub decided_at: Option<String>,
    /// Tier-agnostic — Tier 1 origins or Tier 3 capabilities — stored as a
    /// snapshot at grant time, not re-derived live. See `needs_redecision`.
    pub granted_scope: Vec<String>,
}
