//! Search connector manifest construction (task 13.6), mirroring
//! `apps/mobile/src/connectors/search/manifest.ts` field-for-field.
//!
//! Replaces the static `include_str!` fixture task 12.4 embedded as a
//! stand-in: that fixture (`https://searx.example.org`, a non-dialable
//! placeholder) never matched either of mobile's own two real manifest
//! functions — it declared a credential SearXNG's real manifest doesn't
//! have, and used a slightly different `maxBytes`/tool-parameter shape.
//! These two functions are hand-built Rust-struct-literal ports of
//! mobile's real `buildSearxngManifest`/`TAVILY_MANIFEST`, not the old
//! fixture.

use crate::connectors::manifest::{
    ConnectorManifestTier1, CredentialDeclaration, HttpMethod, NetworkPermissions, PathPart,
    Platform, Pricing, RequestTemplate, ResponseTemplate, Tier1Permissions, ToolDefinition,
    ToolParameters, ValueSource,
};
use std::collections::BTreeMap;

/// One connector id shared by both providers, deliberately — switching
/// providers changes `permissions.network.origins`, which the existing
/// `needs_redecision()` machinery already treats as requiring a fresh
/// grant, so "provider switch = new network destination, re-grant" falls
/// out for free rather than needing its own special case.
pub const CONNECTOR_ID: &str = "fs.sovereign.search";

fn search_tool() -> ToolDefinition {
    let mut properties = serde_json::Map::new();
    properties.insert(
        "query".to_string(),
        serde_json::json!({ "type": "string", "description": "What to search for, in plain language." }),
    );
    ToolDefinition {
        name: "web_search".to_string(),
        description: "Search the web for current information the model does not know.".to_string(),
        parameters: ToolParameters {
            type_: "object".to_string(),
            properties,
            required: Some(vec!["query".to_string()]),
            extra: serde_json::Map::new(),
        },
    }
}

/// `instance_url` must already be a bare origin (scheme+host[+port],
/// nothing else) — same shape `validate_manifest`'s `origin_issue` check
/// requires. No credential: a self-hosted instance is assumed open within
/// the user's own trust boundary; `https` is still required regardless of
/// LAN vs. public, enforced by the validator, not by this function.
pub fn build_searxng_manifest(instance_url: &str) -> ConnectorManifestTier1 {
    let mut query = BTreeMap::new();
    query.insert(
        "q".to_string(),
        ValueSource::Slot {
            slot: "query".to_string(),
        },
    );
    query.insert(
        "format".to_string(),
        ValueSource::Literal {
            literal: "json".to_string(),
        },
    );

    ConnectorManifestTier1 {
        manifest_version: 1,
        id: CONNECTOR_ID.to_string(),
        name: "Search (SearXNG)".to_string(),
        version: "1.0.0".to_string(),
        summary: "Searches the web via your configured SearXNG instance.".to_string(),
        tier: 1,
        platforms: vec![Platform::Ios, Platform::Android],
        tool: search_tool(),
        pricing: Pricing::Free,
        permissions: Tier1Permissions {
            network: NetworkPermissions {
                origins: vec![instance_url.to_string()],
            },
            credentials: None,
        },
        request: RequestTemplate {
            method: HttpMethod::Get,
            origin: instance_url.to_string(),
            path: vec![PathPart::Literal {
                literal: "search".to_string(),
            }],
            query: Some(query),
            headers: None,
            body: None,
        },
        response: ResponseTemplate {
            text_from: "results".to_string(),
            max_bytes: 200_000,
        },
    }
}

/// Fully static — no per-user input beyond the API key, which lives in the
/// vault, not the manifest. Credential key `apiKey` stores the **whole
/// header value** (`Bearer tvly-…`), not just the raw key, because a
/// `ValueSource` inserts a stored credential verbatim with no
/// interpolation — there is nowhere in the manifest itself to prepend
/// `Bearer `, so the caller writing to the vault does it (see
/// `lib.rs`'s `set_search_connector_config`).
pub fn tavily_manifest() -> ConnectorManifestTier1 {
    let mut body = BTreeMap::new();
    body.insert(
        "query".to_string(),
        ValueSource::Slot {
            slot: "query".to_string(),
        },
    );
    let mut headers = BTreeMap::new();
    headers.insert(
        "Authorization".to_string(),
        ValueSource::Credential {
            credential: "apiKey".to_string(),
        },
    );

    ConnectorManifestTier1 {
        manifest_version: 1,
        id: CONNECTOR_ID.to_string(),
        name: "Search (Tavily)".to_string(),
        version: "1.0.0".to_string(),
        summary: "Searches the web via the Tavily API.".to_string(),
        tier: 1,
        platforms: vec![Platform::Ios, Platform::Android],
        tool: search_tool(),
        pricing: Pricing::Free,
        permissions: Tier1Permissions {
            network: NetworkPermissions {
                origins: vec!["https://api.tavily.com".to_string()],
            },
            credentials: Some(vec![CredentialDeclaration {
                key: "apiKey".to_string(),
                label: "Tavily API key".to_string(),
            }]),
        },
        request: RequestTemplate {
            method: HttpMethod::Post,
            origin: "https://api.tavily.com".to_string(),
            path: vec![PathPart::Literal {
                literal: "search".to_string(),
            }],
            query: None,
            headers: Some(headers),
            body: Some(body),
        },
        response: ResponseTemplate {
            text_from: "results".to_string(),
            max_bytes: 200_000,
        },
    }
}
