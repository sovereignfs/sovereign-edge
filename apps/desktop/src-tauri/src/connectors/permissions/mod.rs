//! Grant/consent state machine (task 12.4), mirroring
//! `apps/mobile/src/connectors/permissions/`. Credential storage itself
//! (`vault.ts`'s equivalent) already lives at `crate::secure_storage`
//! (task 12.3) — this module is the state machine that decides *whether*
//! a connector may run and calls into that vault on revoke.

pub mod grants;
pub mod types;

pub use grants::{
    deny, grant, grant_for, grants_directory, is_allowed, list_grants, needs_redecision, revoke,
};
pub use types::{ConnectorGrant, GrantState};
