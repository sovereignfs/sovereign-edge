//! Connector manifest schema and validation (task 12.4), mirroring
//! `apps/mobile/src/connectors/manifest/`.

pub mod fixtures;
pub mod types;
pub mod validate;

#[allow(unused_imports)]
pub use types::{
    ConnectorManifest, ConnectorManifestTier1, ConnectorManifestTier3, CredentialDeclaration,
    DevicePermissions, HttpMethod, NativeHandlerRef, NetworkPermissions, PathPart, Platform,
    Pricing, RequestTemplate, ResponseTemplate, Tier1Permissions, Tier3Permissions, ToolDefinition,
    ToolParameters, ValueSource, MANIFEST_VERSION,
};
pub use validate::{validate_manifest, ValidationIssue, ValidationResult};
