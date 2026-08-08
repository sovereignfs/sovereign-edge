//! Manifest validation (task 12.4), mirroring
//! `apps/mobile/src/connectors/manifest/validate.ts`.
//!
//! Two passes, because they answer different questions. The shape check
//! (`serde`, mirroring Zod) checks the *shape*. This file checks the things
//! that only make sense across fields — a slot that names a parameter the
//! tool does not declare, a credential in a URL, an origin outside the
//! connector's own allowlist. Those are the rules that carry the security
//! properties, and none of them is expressible as a per-field type.
//!
//! **Known simplification versus `validate.ts`:** Zod's `safeParse`
//! collects *every* shape violation at once; `serde_json`'s deserializer
//! stops at the first error. A manifest with several shape problems at
//! once reports only the first one here, not all of them — acceptable
//! because nothing on desktop surfaces `ValidationIssue` lists to a user
//! yet (no UI consumes this — see `core-port.md` task 12.7), and because
//! adding a multi-issue JSON-path-tracking layer (e.g. `serde_path_to_error`)
//! would be a new dependency for a UI polish concern this task doesn't have
//! a consumer for. Cross-field issues (this file's own hand-written logic,
//! not derived from a parsing library) still collect every violation, same
//! as mobile.

use super::types::{
    ConnectorManifest, ConnectorManifestTier1, ConnectorManifestTier3, PathPart, ValueSource,
    MANIFEST_VERSION,
};
use std::collections::{BTreeMap, HashSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidationIssue {
    /// Dotted location within the manifest, e.g. `request.query.q`.
    pub path: String,
    pub message: String,
}

impl ValidationIssue {
    fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub enum ValidationResult {
    /// Boxed: `ConnectorManifest` is large enough (500+ bytes) that an
    /// unboxed variant would make every `ValidationResult` pay that size
    /// even on the much smaller `Invalid` path.
    Valid(Box<ConnectorManifest>),
    Invalid(Vec<ValidationIssue>),
}

/// Origins must be exact: scheme, host, optional port. Nothing else.
fn origin_issue(value: &str, at: &str) -> Option<ValidationIssue> {
    let url = match reqwest::Url::parse(value) {
        Ok(url) => url,
        Err(_) => {
            return Some(ValidationIssue::new(
                at,
                format!("Not a valid URL: {value}"),
            ))
        }
    };

    if url.scheme() != "https" {
        return Some(ValidationIssue::new(
            at,
            format!(
                "Origins must use https (got {}:). iOS App Transport Security refuses cleartext, so an http origin cannot work on device.",
                url.scheme(),
            ),
        ));
    }
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Some(ValidationIssue::new(
            at,
            format!(
                "An origin is scheme, host and optional port only — no path, query, or fragment. Move \"{}{}{}\" into request.path or request.query.",
                url.path(),
                url.query().map(|q| format!("?{q}")).unwrap_or_default(),
                url.fragment().map(|f| format!("#{f}")).unwrap_or_default(),
            ),
        ));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Some(ValidationIssue::new(
            at,
            "An origin must not carry userinfo. Credentials belong in a header or a body field, never in a URL.",
        ));
    }
    None
}

fn sources<'a>(
    record: &'a Option<BTreeMap<String, ValueSource>>,
    at: &str,
) -> Vec<(&'a ValueSource, String)> {
    record
        .iter()
        .flat_map(|m| m.iter())
        .map(|(key, source)| (source, format!("{at}.{key}")))
        .collect()
}

/// Cross-field rules. Runs only once the shape is known good, so it can
/// read the manifest as typed rather than defensively.
fn cross_field_issues(manifest: &ConnectorManifest) -> Vec<ValidationIssue> {
    match manifest {
        ConnectorManifest::Tier1(m) => tier1_cross_field_issues(m),
        ConnectorManifest::Tier3(m) => tier3_cross_field_issues(m),
    }
}

fn tier3_cross_field_issues(manifest: &ConnectorManifestTier3) -> Vec<ValidationIssue> {
    let declared: HashSet<&str> = manifest
        .permissions
        .device
        .capabilities
        .iter()
        .map(String::as_str)
        .collect();

    // Same shape as Tier 1's origin-allowlist check: what the manifest
    // dispatches to must be a subset of what it declared to the user.
    if !declared.contains(manifest.handler.capability.as_str()) {
        return vec![ValidationIssue::new(
            "handler.capability",
            format!(
                "{} is not in permissions.device.capabilities. Every capability a connector uses must be declared, so the user sees it before granting access.",
                manifest.handler.capability,
            ),
        )];
    }
    Vec::new()
}

fn tier1_cross_field_issues(manifest: &ConnectorManifestTier1) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let request = &manifest.request;
    let permissions = &manifest.permissions;
    let tool = &manifest.tool;

    let declared_params: HashSet<&str> = tool
        .parameters
        .properties
        .keys()
        .map(String::as_str)
        .collect();
    let declared_credentials: HashSet<&str> = permissions
        .credentials
        .iter()
        .flatten()
        .map(|c| c.key.as_str())
        .collect();

    if let Some(issue) = origin_issue(&request.origin, "request.origin") {
        issues.push(issue);
    }
    for (i, origin) in permissions.network.origins.iter().enumerate() {
        if let Some(issue) = origin_issue(origin, &format!("permissions.network.origins[{i}]")) {
            issues.push(issue);
        }
    }

    // The allowlist is what the runtime enforces; a request origin outside
    // it would be refused at execution, so refusing it here turns a
    // runtime failure into an authoring error.
    if !permissions
        .network
        .origins
        .iter()
        .any(|o| o == &request.origin)
    {
        issues.push(ValidationIssue::new(
            "request.origin",
            format!(
                "{} is not in permissions.network.origins. Every origin a connector reaches must be declared, so the user sees it before granting access.",
                request.origin,
            ),
        ));
    }

    // Where each kind of value is allowed to appear. A credential can never
    // reach `request.path` at the type level (`PathPart` has no
    // `credential` variant) — so path slots only need the "declared?"
    // check, not the "credential in URL" one.
    for (i, part) in request.path.iter().enumerate() {
        if let PathPart::Slot { slot } = part {
            if !declared_params.contains(slot.as_str()) {
                issues.push(ValidationIssue::new(
                    format!("request.path[{i}]"),
                    format!("Slot \"{slot}\" is not declared in tool.parameters.properties. The model can only fill slots it knows about."),
                ));
            }
        }
    }

    let declare_and_credential_checks =
        |source: &ValueSource, path: &str, issues: &mut Vec<ValidationIssue>| match source {
            ValueSource::Slot { slot } if !declared_params.contains(slot.as_str()) => {
                issues.push(ValidationIssue::new(
                path,
                format!("Slot \"{slot}\" is not declared in tool.parameters.properties. The model can only fill slots it knows about."),
            ));
            }
            ValueSource::Credential { credential }
                if !declared_credentials.contains(credential.as_str()) =>
            {
                issues.push(ValidationIssue::new(
                path,
                format!("Credential \"{credential}\" is not declared in permissions.credentials, so the user would never be asked for it."),
            ));
            }
            _ => {}
        };

    // `request.query` is the other URL-bearing position: unlike `path` it
    // *can* structurally carry a `credential` `ValueSource`, which is
    // exactly the case this check exists to reject.
    for (source, path) in sources(&request.query, "request.query") {
        if matches!(source, ValueSource::Credential { .. }) {
            issues.push(ValidationIssue::new(
                &path,
                "A credential may not appear in a URL. URLs reach proxy logs, Referer headers, and crash reports. Put it in request.headers or request.body.",
            ));
        }
        declare_and_credential_checks(source, &path, &mut issues);
    }

    for (source, path) in sources(&request.headers, "request.headers")
        .into_iter()
        .chain(sources(&request.body, "request.body"))
    {
        declare_and_credential_checks(source, &path, &mut issues);
    }

    if matches!(request.method, super::types::HttpMethod::Get) && request.body.is_some() {
        issues.push(ValidationIssue::new(
            "request.body",
            "A GET request cannot carry a body.",
        ));
    }

    issues
}

/// Validates a manifest from untrusted input.
///
/// An unknown `manifestVersion` is rejected outright rather than parsed
/// leniently: a connector that refuses to load is a better outcome than
/// one that loads with a field silently ignored.
pub fn validate_manifest(input: &serde_json::Value) -> ValidationResult {
    if let Some(version) = input.get("manifestVersion") {
        if version.as_u64() != Some(MANIFEST_VERSION) {
            return ValidationResult::Invalid(vec![ValidationIssue::new(
                "manifestVersion",
                format!(
                    "Unsupported manifestVersion {version}. This build understands version {MANIFEST_VERSION}. The manifest is not loaded rather than partially understood.",
                ),
            )]);
        }
    }

    let tier = input.get("tier").and_then(serde_json::Value::as_u64);
    let manifest = match tier {
        Some(1) => serde_json::from_value::<ConnectorManifestTier1>(input.clone())
            .map(ConnectorManifest::Tier1),
        Some(3) => serde_json::from_value::<ConnectorManifestTier3>(input.clone())
            .map(ConnectorManifest::Tier3),
        _ => {
            return ValidationResult::Invalid(vec![ValidationIssue::new(
                "tier",
                "tier must be 1 or 3",
            )]);
        }
    };
    let manifest = match manifest {
        Ok(m) => m,
        Err(cause) => {
            return ValidationResult::Invalid(vec![ValidationIssue::new(
                "(shape)",
                cause.to_string(),
            )])
        }
    };

    // `tool.parameters.type` must be the literal `"object"` — Zod enforces
    // this as part of the shape (`z.literal('object')`); our shape layer
    // (plain `String`, so `.loose()`'s passthrough on sibling keys stays
    // simple) checks it here instead, one step later but still before
    // cross-field issues.
    let tool = match &manifest {
        ConnectorManifest::Tier1(m) => &m.tool,
        ConnectorManifest::Tier3(m) => &m.tool,
    };
    if tool.parameters.type_ != "object" {
        return ValidationResult::Invalid(vec![ValidationIssue::new(
            "tool.parameters.type",
            format!("Expected \"object\", got \"{}\".", tool.parameters.type_),
        )]);
    }

    let issues = cross_field_issues(&manifest);
    if issues.is_empty() {
        ValidationResult::Valid(Box::new(manifest))
    } else {
        ValidationResult::Invalid(issues)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::manifest::fixtures::SEARCH_MANIFEST_JSON;

    fn search_manifest() -> serde_json::Value {
        serde_json::from_str(SEARCH_MANIFEST_JSON).expect("fixture is valid JSON")
    }

    #[test]
    fn the_real_search_fixture_validates_unchanged() {
        match validate_manifest(&search_manifest()) {
            ValidationResult::Valid(boxed) => match *boxed {
                ConnectorManifest::Tier1(m) => assert_eq!(m.id, "fs.sovereign.search"),
                other => panic!("expected a Tier 1 manifest, got {other:?}"),
            },
            other => panic!("expected the unmodified search fixture to validate, got {other:?}"),
        }
    }

    #[test]
    fn rejects_an_unsupported_manifest_version() {
        let mut manifest = search_manifest();
        manifest["manifestVersion"] = serde_json::json!(2);
        match validate_manifest(&manifest) {
            ValidationResult::Invalid(issues) => assert_eq!(issues[0].path, "manifestVersion"),
            other => panic!("expected rejection, got {other:?}"),
        }
    }

    #[test]
    fn rejects_a_non_https_origin() {
        let mut manifest = search_manifest();
        manifest["request"]["origin"] = serde_json::json!("http://searx.example.org");
        manifest["permissions"]["network"]["origins"] =
            serde_json::json!(["http://searx.example.org"]);
        let ValidationResult::Invalid(issues) = validate_manifest(&manifest) else {
            panic!("expected rejection of an http origin");
        };
        assert!(issues
            .iter()
            .any(|i| i.path == "request.origin" && i.message.contains("https")));
    }

    #[test]
    fn rejects_a_request_origin_outside_the_allowlist() {
        let mut manifest = search_manifest();
        manifest["request"]["origin"] = serde_json::json!("https://not-allowlisted.example.org");
        let ValidationResult::Invalid(issues) = validate_manifest(&manifest) else {
            panic!("expected rejection of a non-allowlisted origin");
        };
        assert!(issues.iter().any(|i| i.path == "request.origin"
            && i.message.contains("not in permissions.network.origins")));
    }

    #[test]
    fn rejects_a_credential_in_a_query_value() {
        let mut manifest = search_manifest();
        manifest["request"]["query"]["token"] = serde_json::json!({ "credential": "apiToken" });
        let ValidationResult::Invalid(issues) = validate_manifest(&manifest) else {
            panic!("expected rejection of a credential in the URL");
        };
        assert!(issues
            .iter()
            .any(|i| i.path == "request.query.token"
                && i.message.contains("may not appear in a URL")));
    }

    #[test]
    fn rejects_an_undeclared_slot() {
        let mut manifest = search_manifest();
        manifest["request"]["query"]["extra"] = serde_json::json!({ "slot": "undeclaredSlot" });
        let ValidationResult::Invalid(issues) = validate_manifest(&manifest) else {
            panic!("expected rejection of an undeclared slot");
        };
        assert!(issues.iter().any(|i| i
            .message
            .contains("is not declared in tool.parameters.properties")));
    }

    #[test]
    fn rejects_an_undeclared_credential() {
        let mut manifest = search_manifest();
        manifest["request"]["headers"]["X-Other"] =
            serde_json::json!({ "credential": "undeclaredCred" });
        let ValidationResult::Invalid(issues) = validate_manifest(&manifest) else {
            panic!("expected rejection of an undeclared credential");
        };
        assert!(issues.iter().any(|i| i
            .message
            .contains("is not declared in permissions.credentials")));
    }

    #[test]
    fn rejects_a_get_request_with_a_body() {
        let mut manifest = search_manifest();
        manifest["request"]["body"] = serde_json::json!({ "x": { "literal": "y" } });
        let ValidationResult::Invalid(issues) = validate_manifest(&manifest) else {
            panic!("expected rejection of a GET request with a body");
        };
        assert!(issues
            .iter()
            .any(|i| i.path == "request.body" && i.message.contains("cannot carry a body")));
    }
}
