//! The Tier 1 connector manifest (task 12.4), mirroring
//! `apps/mobile/src/connectors/manifest/schema.ts`.
//!
//! Every connector — Search now, third-party ones in Phase 3 — is described
//! entirely by this shape; no connector-specific code exists in the
//! runtime. Two properties are load-bearing, ported unchanged from mobile's
//! own doc comment:
//!
//! 1. **No expression language, no string interpolation.** A request is
//!    assembled from literal parts and named slots; the runtime encodes
//!    each slot for the position it occupies. Free interpolation would make
//!    origin escape, path traversal, and header injection expressible in a
//!    manifest.
//! 2. **A credential may never appear in a URL** — not the origin, a path
//!    segment, or a query value. `PathPart` has no `credential` variant at
//!    all, so this is enforced by the type, not just the validator.
//!
//! `#[serde(deny_unknown_fields)]` throughout mirrors Zod's `.strict()`;
//! `ToolParameters` alone mirrors `.loose()` via `#[serde(flatten)]`
//! (unknown JSON-Schema keywords pass through untouched rather than being
//! rejected).

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Bumped when this schema changes shape. Distinct from a connector's own
/// `version`.
pub const MANIFEST_VERSION: u64 = 1;

/// Where a single value comes from. Encoding is decided by *position*, not
/// declared here — a `ValueSource` inside `query` is encoded as a query
/// value, one inside `path` as a path segment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ValueSource {
    Literal { literal: String },
    Slot { slot: String },
    Credential { credential: String },
}

/// A path is literal segments and slots. A slot fills exactly one segment.
/// No `credential` variant — a credential can never appear in a URL path
/// *by construction*, not by validator discipline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PathPart {
    Literal { literal: String },
    Slot { slot: String },
}

/// The tool as the model sees it. `parameters` is JSON Schema, validated
/// only shallowly (enough to check slot references against
/// `properties`) and otherwise passed through untouched.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: ToolParameters,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParameters {
    #[serde(rename = "type")]
    pub type_: String,
    pub properties: serde_json::Map<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required: Option<Vec<String>>,
    /// `.loose()` in the Zod schema: any other JSON-Schema keyword passes
    /// through untouched rather than being rejected.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Ios,
    Android,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "model", rename_all = "lowercase", deny_unknown_fields)]
pub enum Pricing {
    Free,
    Paid {
        #[serde(rename = "productId")]
        product_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CredentialDeclaration {
    pub key: String,
    /// Shown to the user when asking for it.
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NetworkPermissions {
    /// Origins this connector may reach. The runtime refuses anything
    /// else, which is what makes the per-connector grant enforceable
    /// rather than advisory.
    pub origins: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tier1Permissions {
    pub network: NetworkPermissions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credentials: Option<Vec<CredentialDeclaration>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HttpMethod {
    #[serde(rename = "GET")]
    Get,
    #[serde(rename = "POST")]
    Post,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestTemplate {
    pub method: HttpMethod,
    pub origin: String,
    pub path: Vec<PathPart>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<BTreeMap<String, ValueSource>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<BTreeMap<String, ValueSource>>,
    /// JSON body. Values may be slots or credentials; keys are literal.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<BTreeMap<String, ValueSource>>,
}

/// How a response becomes text for the model. Deliberately minimal.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ResponseTemplate {
    /// Dotted path into the JSON body, e.g. `results.0.snippet`.
    pub text_from: String,
    /// Refuse a body larger than this before parsing it.
    pub max_bytes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ConnectorManifestTier1 {
    pub manifest_version: u64,
    pub id: String,
    pub name: String,
    pub version: String,
    pub summary: String,
    pub tier: u64,
    pub platforms: Vec<Platform>,
    pub tool: ToolDefinition,
    pub pricing: Pricing,
    pub permissions: Tier1Permissions,
    pub request: RequestTemplate,
    pub response: ResponseTemplate,
}

/// Tier 3 permissions: named OS capabilities rather than origins. Fills the
/// same role `permissions.network.origins` does for Tier 1.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DevicePermissions {
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tier3Permissions {
    pub device: DevicePermissions,
}

/// A reference to a registered native handler, in place of Tier 1's HTTP
/// `request`/`response` templates. No expression language here either — a
/// capability name is all a manifest gets to say; the runtime (task 12.5)
/// owns what that capability actually does.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeHandlerRef {
    pub capability: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ConnectorManifestTier3 {
    pub manifest_version: u64,
    pub id: String,
    pub name: String,
    pub version: String,
    pub summary: String,
    pub tier: u64,
    pub platforms: Vec<Platform>,
    pub tool: ToolDefinition,
    pub pricing: Pricing,
    pub permissions: Tier3Permissions,
    pub handler: NativeHandlerRef,
}

/// Discriminated on `tier`. A hand-rolled two-step parse (see
/// `validate.rs`) rather than a serde `#[serde(tag = ...)]` enum: serde's
/// internal tagging expects a *string* discriminant matching a Rust
/// variant name, not the arbitrary numeric `tier` field Zod's
/// `discriminatedUnion('tier', ...)` allows.
#[derive(Debug, Clone)]
pub enum ConnectorManifest {
    Tier1(ConnectorManifestTier1),
    Tier3(ConnectorManifestTier3),
}

impl ConnectorManifest {
    pub fn id(&self) -> &str {
        match self {
            Self::Tier1(m) => &m.id,
            Self::Tier3(m) => &m.id,
        }
    }

    pub fn tier(&self) -> u64 {
        match self {
            Self::Tier1(_) => 1,
            Self::Tier3(_) => 3,
        }
    }

    /// The tool as the model sees it — needed by `connectors::routing`
    /// (task 12.7a) to build the `engine::ToolDefinition` list offered to
    /// a generation call, mirroring `route.ts` reading `manifest.tool`.
    pub fn tool(&self) -> &ToolDefinition {
        match self {
            Self::Tier1(m) => &m.tool,
            Self::Tier3(m) => &m.tool,
        }
    }

    /// The connector's own display name (e.g. "Search") — distinct from
    /// `tool().name`, the function name the model calls (e.g. "search").
    /// `connectors::orchestration` (task 12.7a) tags a reply with this,
    /// mirroring `connectorOrchestration.ts` returning `connector:
    /// manifest.name`, not `manifest.tool.name`.
    pub fn name(&self) -> &str {
        match self {
            Self::Tier1(m) => &m.name,
            Self::Tier3(m) => &m.name,
        }
    }

    /// Tier-agnostic granted scope: Tier 1 → declared origins, Tier 3 →
    /// declared capabilities. Mirrors `grants.ts`'s `connectorScope`.
    pub fn scope(&self) -> Vec<String> {
        match self {
            Self::Tier1(m) => m.permissions.network.origins.clone(),
            Self::Tier3(m) => m.permissions.device.capabilities.clone(),
        }
    }
}
