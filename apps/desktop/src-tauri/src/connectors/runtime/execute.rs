//! Tier 1 (HTTP) connector runtime dispatch (task 12.4), mirroring
//! `apps/mobile/src/connectors/runtime/execute.ts`.
//!
//! Split into pure/testable pieces unlike mobile's single `fetch`-mocked
//! function: `build_request` (resolve the manifest's template into a real
//! `reqwest::Request`, no I/O) and `map_response` (status/size/JSON/
//! `textFrom` mapping, no I/O) are both directly unit-testable with
//! synthetic inputs; `dispatch` is the async glue that does the actual
//! credential lookup and network I/O around them.
//!
//! **Known, inherited quirk** (porting `execute.ts` unchanged, not fixing
//! it here — `core-port.md` says reuse as-is): the credential-key prefetch
//! below only scans `request.headers`/`request.body`, not `request.query`.
//! `request.path` can never carry a `credential` `ValueSource` (the type
//! forbids it), so that part is a non-issue, but a `credential` source
//! inside `request.query` — structurally legal per the schema, even though
//! no current fixture uses one and the validator would reject it anyway
//! per `validate.rs`'s "credential may not appear in a URL" rule — would
//! never be pre-fetched into the credential map, so `resolve()` always
//! reports it `missing-credential` regardless of what the vault holds.

use super::types::{ExecutionFailure, ExecutionResult, FailureReason};
use crate::connectors::manifest::{
    ConnectorManifest, ConnectorManifestTier1, HttpMethod, PathPart, ResponseTemplate, ValueSource,
};
use crate::connectors::permissions;
use crate::secure_storage;
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

/// Runtime constant, not a manifest field, per the epic's own list — same
/// as mobile's `TIMEOUT_MS`. No retries: a single clean failure is more
/// honest than silently repeating a request the user never saw happen once.
const TIMEOUT_MS: u64 = 15_000;
const CONTENT_TYPE: &str = "Content-Type";
const APPLICATION_JSON: &str = "application/json";

enum Resolved {
    Value(serde_json::Value),
    /// The referenced argument was never supplied — a query value or
    /// header can simply be left out; a path segment cannot.
    Omit,
    Error,
}

fn resolve(
    source: &ValueSource,
    args: &serde_json::Map<String, serde_json::Value>,
    credentials: &HashMap<String, String>,
) -> Resolved {
    match source {
        ValueSource::Literal { literal } => {
            Resolved::Value(serde_json::Value::String(literal.clone()))
        }
        ValueSource::Slot { slot } => match args.get(slot) {
            Some(value) => Resolved::Value(value.clone()),
            None => Resolved::Omit,
        },
        ValueSource::Credential { credential } => match credentials.get(credential) {
            Some(secret) => Resolved::Value(serde_json::Value::String(secret.clone())),
            None => Resolved::Error,
        },
    }
}

/// `String(value)` in JS coerces primitives directly; this covers the
/// shapes slot arguments realistically take (a tool-call argument from the
/// model's JSON output — string/number/bool), falling back to compact JSON
/// for anything else rather than Rust's `{:?}` debug formatting.
fn value_to_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

/// Dotted path into a parsed JSON body, e.g. `results.0.snippet`.
fn read_path<'a>(value: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
    let mut current = value;
    for segment in path.split('.') {
        current = match current {
            serde_json::Value::Object(map) => map.get(segment)?,
            serde_json::Value::Array(arr) => arr.get(segment.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(current)
}

/// Resolves `manifest`'s request template against `args`/`credentials`
/// into a real `reqwest::Request`. Pure — no network access, so this is
/// directly unit-testable against the real `search.manifest.json` fixture.
pub fn build_request(
    client: &reqwest::Client,
    manifest: &ConnectorManifestTier1,
    args: &serde_json::Value,
    credentials: &HashMap<String, String>,
) -> Result<reqwest::Request, ExecutionFailure> {
    let empty = serde_json::Map::new();
    let arg_record = args.as_object().unwrap_or(&empty);
    let request = &manifest.request;

    let mut segments = Vec::with_capacity(request.path.len());
    for part in &request.path {
        let source = match part {
            PathPart::Literal { literal } => ValueSource::Literal {
                literal: literal.clone(),
            },
            PathPart::Slot { slot } => ValueSource::Slot { slot: slot.clone() },
        };
        match resolve(&source, arg_record, credentials) {
            Resolved::Error => return Err(ExecutionFailure::new(FailureReason::MissingCredential)),
            Resolved::Omit => return Err(ExecutionFailure::new(FailureReason::InvalidArguments)),
            Resolved::Value(v) => segments.push(value_to_string(&v)),
        }
    }

    let mut url = reqwest::Url::parse(&request.origin)
        .map_err(|_| ExecutionFailure::new(FailureReason::InvalidArguments))?;
    // `path_segments_mut().push()` percent-encodes each segment per the URL
    // spec (the `url` crate's own job, already a transitive dependency via
    // `reqwest` — no separate `percent-encoding` crate needed), the same
    // role `encodeURIComponent` plays in `execute.ts`.
    {
        let mut path_segments = url
            .path_segments_mut()
            .map_err(|_| ExecutionFailure::new(FailureReason::InvalidArguments))?;
        path_segments.clear();
        for segment in &segments {
            path_segments.push(segment);
        }
    }

    if let Some(query) = &request.query {
        for (key, source) in query {
            match resolve(source, arg_record, credentials) {
                Resolved::Error => {
                    return Err(ExecutionFailure::new(FailureReason::MissingCredential))
                }
                Resolved::Omit => {}
                Resolved::Value(v) => {
                    url.query_pairs_mut().append_pair(key, &value_to_string(&v));
                }
            }
        }
    }

    let mut headers = reqwest::header::HeaderMap::new();
    if let Some(header_sources) = &request.headers {
        for (key, source) in header_sources {
            match resolve(source, arg_record, credentials) {
                Resolved::Error => {
                    return Err(ExecutionFailure::new(FailureReason::MissingCredential))
                }
                Resolved::Omit => {}
                Resolved::Value(v) => {
                    let name = reqwest::header::HeaderName::from_bytes(key.as_bytes())
                        .map_err(|_| ExecutionFailure::new(FailureReason::InvalidArguments))?;
                    let value = reqwest::header::HeaderValue::from_str(&value_to_string(&v))
                        .map_err(|_| ExecutionFailure::new(FailureReason::InvalidArguments))?;
                    headers.insert(name, value);
                }
            }
        }
    }

    let mut body_bytes: Option<Vec<u8>> = None;
    if let Some(body_sources) = &request.body {
        let mut body_obj = serde_json::Map::new();
        for (key, source) in body_sources {
            match resolve(source, arg_record, credentials) {
                Resolved::Error => {
                    return Err(ExecutionFailure::new(FailureReason::MissingCredential))
                }
                Resolved::Omit => {}
                Resolved::Value(v) => {
                    body_obj.insert(key.clone(), v);
                }
            }
        }
        body_bytes = Some(
            serde_json::to_vec(&serde_json::Value::Object(body_obj))
                .expect("Map<String,Value> always serializes"),
        );
        // Mechanical, not something a connector author should have to
        // declare.
        headers.insert(
            CONTENT_TYPE,
            reqwest::header::HeaderValue::from_static(APPLICATION_JSON),
        );
    }

    let method = match request.method {
        HttpMethod::Get => reqwest::Method::GET,
        HttpMethod::Post => reqwest::Method::POST,
    };

    let mut builder = client.request(method, url).headers(headers);
    if let Some(bytes) = body_bytes {
        builder = builder.body(bytes);
    }
    builder
        .build()
        .map_err(|_| ExecutionFailure::new(FailureReason::InvalidArguments))
}

/// Status/size/JSON/`textFrom` mapping. Pure — directly unit-testable with
/// synthetic bytes, no server involved.
pub fn map_response(
    status: reqwest::StatusCode,
    content_length: Option<u64>,
    body: &[u8],
    response_spec: &ResponseTemplate,
) -> Result<String, ExecutionFailure> {
    // Never followed (the caller's `reqwest::Client` is built with
    // `redirect::Policy::none()`) — a redirect to another origin would
    // defeat the origin allowlist that makes the grant enforceable.
    if (300..400).contains(&status.as_u16()) {
        return Err(ExecutionFailure::new(FailureReason::Redirected));
    }
    if !status.is_success() {
        return Err(ExecutionFailure::with_detail(
            FailureReason::HttpError,
            status.as_u16().to_string(),
        ));
    }

    if let Some(len) = content_length {
        if len > 0 && len > response_spec.max_bytes as u64 {
            return Err(ExecutionFailure::new(FailureReason::ResponseTooLarge));
        }
    }
    // `Content-Length` can be absent or wrong, so the decoded body is
    // checked regardless of what the header claimed.
    if body.len() as u64 > response_spec.max_bytes as u64 {
        return Err(ExecutionFailure::new(FailureReason::ResponseTooLarge));
    }

    let parsed: serde_json::Value = serde_json::from_slice(body)
        .map_err(|_| ExecutionFailure::new(FailureReason::MalformedResponse))?;

    let text = read_path(&parsed, &response_spec.text_from)
        .ok_or_else(|| ExecutionFailure::new(FailureReason::MalformedResponse))?;
    Ok(match text {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    })
}

/// Executes a Tier 1 call end to end: gates on the grant, resolves
/// credentials from the vault, builds and sends the request, maps the
/// response.
async fn dispatch(
    client: &reqwest::Client,
    manifest: &ConnectorManifest,
    tier1: &ConnectorManifestTier1,
    args: &serde_json::Value,
    grants_dir: &Path,
) -> ExecutionResult {
    if !permissions::is_allowed(grants_dir, manifest) {
        return ExecutionResult::Err(ExecutionFailure::new(FailureReason::NotPermitted));
    }

    let mut credential_keys = std::collections::HashSet::new();
    for source in tier1
        .request
        .headers
        .iter()
        .flatten()
        .map(|(_, v)| v)
        .chain(tier1.request.body.iter().flatten().map(|(_, v)| v))
    {
        if let ValueSource::Credential { credential } = source {
            credential_keys.insert(credential.clone());
        }
    }

    let vault = match secure_storage::open_vault(&tier1.id) {
        Ok(v) => v,
        Err(cause) => {
            return ExecutionResult::Err(ExecutionFailure::with_detail(
                FailureReason::MissingCredential,
                cause.to_string(),
            ))
        }
    };
    let mut credentials = HashMap::new();
    for key in credential_keys {
        match vault.read(&key) {
            Ok(Some(value)) => {
                credentials.insert(key, value);
            }
            Ok(None) => {
                return ExecutionResult::Err(ExecutionFailure::with_detail(
                    FailureReason::MissingCredential,
                    key,
                ))
            }
            Err(cause) => {
                return ExecutionResult::Err(ExecutionFailure::with_detail(
                    FailureReason::MissingCredential,
                    cause.to_string(),
                ))
            }
        }
    }

    let request = match build_request(client, tier1, args, &credentials) {
        Ok(r) => r,
        Err(failure) => return ExecutionResult::Err(failure),
    };

    let response = match client.execute(request).await {
        Ok(r) => r,
        Err(cause) => {
            return ExecutionResult::Err(ExecutionFailure::with_detail(
                FailureReason::NetworkError,
                cause.to_string(),
            ))
        }
    };

    let status = response.status();
    let content_length = response.content_length();
    let body = match response.bytes().await {
        Ok(b) => b,
        Err(cause) => {
            return ExecutionResult::Err(ExecutionFailure::with_detail(
                FailureReason::NetworkError,
                cause.to_string(),
            ))
        }
    };

    match map_response(status, content_length, &body, &tier1.response) {
        Ok(text) => ExecutionResult::Ok { text },
        Err(failure) => ExecutionResult::Err(failure),
    }
}

/// Executes a validated tool call against a connector's manifest.
/// Dispatches on tier — Tier 1's HTTP request/response mapping, Tier 3's
/// native handler registry lookup (task 12.5), mirroring `executeConnectorCall`.
pub async fn execute_connector_call(
    client: &reqwest::Client,
    manifest: &ConnectorManifest,
    args: &serde_json::Value,
    grants_dir: &Path,
) -> ExecutionResult {
    match manifest {
        ConnectorManifest::Tier1(tier1) => {
            dispatch(client, manifest, tier1, args, grants_dir).await
        }
        ConnectorManifest::Tier3(tier3) => dispatch_tier3(manifest, tier3, args, grants_dir),
    }
}

/// Mirrors `executeTier3`: gate on the grant, look up the registered
/// handler by `handler.capability`, normalize `args`, call it. Sync (no
/// `.await` inside) since `native_handlers`'s own handlers are all
/// synchronous — kept as a separate function anyway so `execute_connector_call`
/// reads the same tier-1/tier-3 shape mobile's own `executeConnectorCall`
/// does.
fn dispatch_tier3(
    manifest: &ConnectorManifest,
    tier3: &crate::connectors::manifest::ConnectorManifestTier3,
    args: &serde_json::Value,
    grants_dir: &Path,
) -> ExecutionResult {
    if !permissions::is_allowed(grants_dir, manifest) {
        return ExecutionResult::Err(ExecutionFailure::new(FailureReason::NotPermitted));
    }

    let Some(handler) = crate::connectors::runtime::native_handler_for(&tier3.handler.capability)
    else {
        return ExecutionResult::Err(ExecutionFailure::with_detail(
            FailureReason::HandlerError,
            format!(
                "No native handler registered for capability \"{}\".",
                tier3.handler.capability
            ),
        ));
    };

    let empty = serde_json::Map::new();
    let arg_record = args.as_object().unwrap_or(&empty);

    match handler(arg_record) {
        Ok(text) => ExecutionResult::Ok { text },
        Err(message) => ExecutionResult::Err(ExecutionFailure::with_detail(
            FailureReason::HandlerError,
            message,
        )),
    }
}

/// A `reqwest::Client` configured the way every Tier 1 dispatch needs:
/// never follows redirects (see `map_response`'s own comment) and applies
/// the runtime's fixed request timeout.
pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_millis(TIMEOUT_MS))
        .build()
        .expect("a bare reqwest client builder cannot fail")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connectors::manifest::fixtures::{DEVICE_INFO_MANIFEST_JSON, SEARCH_MANIFEST_JSON};
    use crate::connectors::manifest::ConnectorManifestTier3;
    use crate::connectors::permissions;

    fn search_manifest() -> ConnectorManifestTier1 {
        serde_json::from_str(SEARCH_MANIFEST_JSON).expect("fixture parses as a Tier 1 manifest")
    }

    fn device_info_manifest() -> ConnectorManifestTier3 {
        serde_json::from_str(DEVICE_INFO_MANIFEST_JSON)
            .expect("fixture parses as a Tier 3 manifest")
    }

    fn credentials(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    // --- build_request: pure, no network, against the real fixture ---

    #[test]
    fn builds_the_real_search_request_exactly() {
        let manifest = search_manifest();
        let args = serde_json::json!({ "query": "chili" });
        let creds = credentials(&[("apiToken", "secret-token")]);

        let request =
            build_request(&client(), &manifest, &args, &creds).expect("request should build");

        assert_eq!(request.method(), &reqwest::Method::GET);
        assert_eq!(
            request.url().origin().ascii_serialization(),
            "https://searx.example.org"
        );
        assert_eq!(request.url().path(), "/search");
        let query: std::collections::HashMap<_, _> =
            request.url().query_pairs().into_owned().collect();
        assert_eq!(query.get("q"), Some(&"chili".to_string()));
        assert_eq!(query.get("format"), Some(&"json".to_string()));
        // The `language` slot had no matching argument — omitted, not sent
        // as an empty value.
        assert!(!query.contains_key("language"));
        assert_eq!(
            request.headers().get("Authorization").unwrap(),
            "secret-token"
        );
    }

    #[test]
    fn reports_invalid_arguments_when_a_required_path_slot_is_unfilled() {
        let mut manifest = search_manifest();
        manifest.request.path = vec![PathPart::Slot {
            slot: "query".to_string(),
        }];
        manifest.request.query = None;

        let failure = build_request(
            &client(),
            &manifest,
            &serde_json::json!({}),
            &HashMap::new(),
        )
        .unwrap_err();
        assert_eq!(failure.reason, FailureReason::InvalidArguments);
    }

    #[test]
    fn reports_missing_credential_when_not_prefetched() {
        let manifest = search_manifest();
        let args = serde_json::json!({ "query": "chili" });

        // `credentials` deliberately doesn't contain "apiToken" — mirrors
        // `resolve()`'s own `missing-credential` path (in practice
        // `dispatch()` never reaches `build_request` in this state; this
        // exercises the pure function's own defensive branch directly).
        let failure = build_request(&client(), &manifest, &args, &HashMap::new()).unwrap_err();
        assert_eq!(failure.reason, FailureReason::MissingCredential);
    }

    #[test]
    fn sends_a_json_body_and_sets_content_type_automatically() {
        let mut manifest = search_manifest();
        manifest.id = "fs.sovereign.post-fixture".to_string();
        manifest.request = crate::connectors::manifest::RequestTemplate {
            method: HttpMethod::Post,
            origin: "https://api.example.org".to_string(),
            path: vec![PathPart::Literal {
                literal: "submit".to_string(),
            }],
            query: None,
            headers: None,
            body: Some(std::collections::BTreeMap::from([
                (
                    "query".to_string(),
                    ValueSource::Slot {
                        slot: "query".to_string(),
                    },
                ),
                (
                    "note".to_string(),
                    ValueSource::Slot {
                        slot: "note".to_string(),
                    },
                ),
            ])),
        };

        let args = serde_json::json!({ "query": "chili" });
        let request = build_request(&client(), &manifest, &args, &HashMap::new())
            .expect("request should build");

        assert_eq!(request.method(), &reqwest::Method::POST);
        assert_eq!(request.url().as_str(), "https://api.example.org/submit");
        assert_eq!(
            request.headers().get(CONTENT_TYPE).unwrap(),
            APPLICATION_JSON
        );
        let body = request.body().unwrap().as_bytes().unwrap();
        // "note" was omitted — no matching argument — same as a query slot.
        assert_eq!(body, br#"{"query":"chili"}"#);
    }

    // --- map_response: pure, no network ---

    fn response_spec(text_from: &str, max_bytes: u32) -> ResponseTemplate {
        ResponseTemplate {
            text_from: text_from.to_string(),
            max_bytes,
        }
    }

    #[test]
    fn maps_a_successful_json_response() {
        let body = br#"{"results":"chili recipes"}"#;
        let text = map_response(
            reqwest::StatusCode::OK,
            Some(body.len() as u64),
            body,
            &response_spec("results", 1000),
        )
        .unwrap();
        assert_eq!(text, "chili recipes");
    }

    #[test]
    fn treats_a_3xx_status_as_a_redirect() {
        let failure = map_response(
            reqwest::StatusCode::FOUND,
            None,
            b"",
            &response_spec("results", 1000),
        )
        .unwrap_err();
        assert_eq!(failure.reason, FailureReason::Redirected);
    }

    #[test]
    fn reports_http_error_on_a_non_2xx_response() {
        let failure = map_response(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            None,
            b"",
            &response_spec("results", 1000),
        )
        .unwrap_err();
        assert_eq!(failure.reason, FailureReason::HttpError);
        assert_eq!(failure.detail.as_deref(), Some("500"));
    }

    #[test]
    fn rejects_a_response_over_max_bytes_by_declared_content_length() {
        let body = br#"{"results":"x"}"#;
        let failure = map_response(
            reqwest::StatusCode::OK,
            Some(1000 + 1),
            body,
            &response_spec("results", 1000),
        )
        .unwrap_err();
        assert_eq!(failure.reason, FailureReason::ResponseTooLarge);
    }

    #[test]
    fn rejects_an_oversized_body_even_when_content_length_under_reports_it() {
        let big = "x".repeat(1001);
        let body = serde_json::to_vec(&serde_json::json!({ "results": big })).unwrap();
        // Content-Length claims 1 byte — the actual-length fallback check
        // must still catch this.
        let failure = map_response(
            reqwest::StatusCode::OK,
            Some(1),
            &body,
            &response_spec("results", 1000),
        )
        .unwrap_err();
        assert_eq!(failure.reason, FailureReason::ResponseTooLarge);
    }

    #[test]
    fn reports_malformed_response_on_invalid_json() {
        let failure = map_response(
            reqwest::StatusCode::OK,
            None,
            b"not json",
            &response_spec("results", 1000),
        )
        .unwrap_err();
        assert_eq!(failure.reason, FailureReason::MalformedResponse);
    }

    #[test]
    fn reports_malformed_response_when_text_from_resolves_to_nothing() {
        let body = br#"{"somethingElse":"x"}"#;
        let failure = map_response(
            reqwest::StatusCode::OK,
            None,
            body,
            &response_spec("results", 1000),
        )
        .unwrap_err();
        assert_eq!(failure.reason, FailureReason::MalformedResponse);
    }

    // --- execute_connector_call: gating, before any network call ---

    fn use_mock_keyring() {
        crate::secure_storage::vault::use_test_keyring_backend();
    }

    #[tokio::test]
    async fn refuses_an_unpermitted_connector_without_touching_the_network() {
        use_mock_keyring();
        let manifest = ConnectorManifest::Tier1(search_manifest());
        let grants_dir = tempfile_dir();

        let result = execute_connector_call(
            &client(),
            &manifest,
            &serde_json::json!({ "query": "chili" }),
            &grants_dir,
        )
        .await;

        match result {
            ExecutionResult::Err(f) => assert_eq!(f.reason, FailureReason::NotPermitted),
            other => panic!("expected not-permitted, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn reports_missing_credential_from_the_vault_before_any_network_call() {
        use_mock_keyring();
        // A unique id, not the shared fixture id: the test keyring backend
        // is process-global (see its own doc comment), shared with every
        // other test in this binary — reusing "fs.sovereign.search" could
        // race against another test's write to the same vault entry.
        let mut manifest_tier1 = search_manifest();
        manifest_tier1.id = format!(
            "fs.sovereign.search.missing-credential-test-{}",
            uuid_like()
        );
        let manifest = ConnectorManifest::Tier1(manifest_tier1);
        let grants_dir = tempfile_dir();
        permissions::grant(&grants_dir, &manifest);
        // Deliberately never written to the vault.

        let result = execute_connector_call(
            &client(),
            &manifest,
            &serde_json::json!({ "query": "chili" }),
            &grants_dir,
        )
        .await;

        match result {
            ExecutionResult::Err(f) => {
                assert_eq!(f.reason, FailureReason::MissingCredential);
                assert_eq!(f.detail.as_deref(), Some("apiToken"));
            }
            other => panic!("expected missing-credential, got {other:?}"),
        }
    }

    /// A fresh scratch directory under the OS temp dir, unique per call —
    /// no `tempfile` crate dependency for one throwaway test directory.
    fn tempfile_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("sovereign-edge-desktop-test-{}", uuid_like()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// PID + a counter, not just a timestamp: tests run in parallel on
    /// separate threads, and two calls close enough in time can land on
    /// the same clock tick — an atomic counter is unique regardless of
    /// clock resolution.
    fn uuid_like() -> String {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("{:x}-{n:x}", std::process::id())
    }

    // --- Tier 3 dispatch (task 12.5) ---

    #[tokio::test]
    async fn device_info_returns_real_text_when_granted() {
        let manifest = ConnectorManifest::Tier3(device_info_manifest());
        let grants_dir = tempfile_dir();
        permissions::grant(&grants_dir, &manifest);

        let result =
            execute_connector_call(&client(), &manifest, &serde_json::json!({}), &grants_dir).await;

        match result {
            ExecutionResult::Ok { text } => assert!(
                !text.trim().is_empty(),
                "expected non-empty device info text"
            ),
            other => panic!("expected a successful device.info call, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn tier3_refuses_an_unpermitted_connector_without_touching_the_handler() {
        let manifest = ConnectorManifest::Tier3(device_info_manifest());
        let grants_dir = tempfile_dir();
        // Deliberately never granted.

        let result =
            execute_connector_call(&client(), &manifest, &serde_json::json!({}), &grants_dir).await;

        match result {
            ExecutionResult::Err(f) => assert_eq!(f.reason, FailureReason::NotPermitted),
            other => panic!("expected not-permitted, got {other:?}"),
        }
    }

    // Mirrors task 12.5's own review checklist wording exactly: "revoking a
    // Tier 3 connector's grant blocks its Tauri command from running" — not
    // just "never granted", but granted-then-revoked.
    #[tokio::test]
    async fn revoking_a_tier3_grant_blocks_the_native_handler() {
        let manifest = ConnectorManifest::Tier3(device_info_manifest());
        let grants_dir = tempfile_dir();
        permissions::grant(&grants_dir, &manifest);
        assert!(matches!(
            execute_connector_call(&client(), &manifest, &serde_json::json!({}), &grants_dir).await,
            ExecutionResult::Ok { .. }
        ));

        permissions::revoke(&grants_dir, &manifest)
            .expect("revoke should succeed (Tier 3 has no vault credentials to clear)");

        let result =
            execute_connector_call(&client(), &manifest, &serde_json::json!({}), &grants_dir).await;
        match result {
            ExecutionResult::Err(f) => assert_eq!(f.reason, FailureReason::NotPermitted),
            other => panic!("expected not-permitted after revoke, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn reports_handler_error_for_an_unregistered_capability() {
        let mut manifest_tier3 = device_info_manifest();
        manifest_tier3.handler.capability = "calendar.write".to_string();
        manifest_tier3.permissions.device.capabilities = vec!["calendar.write".to_string()];
        let manifest = ConnectorManifest::Tier3(manifest_tier3);
        let grants_dir = tempfile_dir();
        permissions::grant(&grants_dir, &manifest);

        let result =
            execute_connector_call(&client(), &manifest, &serde_json::json!({}), &grants_dir).await;

        match result {
            ExecutionResult::Err(f) => assert_eq!(f.reason, FailureReason::HandlerError),
            other => panic!("expected handler-error, got {other:?}"),
        }
    }
}
