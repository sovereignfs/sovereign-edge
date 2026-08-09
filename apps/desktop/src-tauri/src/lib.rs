//! Task 12.2 adds the desktop `EngineAdapter`/model manager, task 12.4 the
//! Tier 1 connector runtime, and task 12.5 the Tier 3 native handler
//! registry (`device_info`) — still no UI consuming any of it; that's task
//! 12.7's job. Every command this app exposes is registered here, each
//! listed in `build.rs`'s `AppManifest::commands` and gated by its own
//! named permission in `capabilities/default.json` (task 12.5 closed the
//! gap where that gating wasn't actually wired up yet).

// `pub` so `tests/engine_smoke.rs`/`tests/vault_smoke.rs`/
// `tests/connector_dispatch.rs` (external crates, per Cargo's
// integration-test convention) can exercise the real
// `EngineAdapter`/`ModelManager`/`ConnectorVault`/connector dispatch
// directly — task 12.2's, 12.3's, and 12.4's own review bars are real
// on-device/network behavior, not just `cargo check` passing.
pub mod connectors;
pub mod engine;
pub mod models;
pub mod secure_storage;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio_util::sync::CancellationToken;

type Manager_ = models::ModelManager<engine::EngineAdapter>;

struct AppState {
    manager: Mutex<Manager_>,
    engine: Arc<Mutex<engine::EngineAdapter>>,
    /// The in-flight generation's cancel switch, if any — `cancel_generation`
    /// trips it; `generate` clears it when done.
    cancel: Mutex<Option<CancellationToken>>,
    /// Where `connectors/grants.json` lives — resolved once in `run()`'s
    /// setup, the same convention `models_dir` already follows.
    connectors_dir: PathBuf,
    connector_http_client: reqwest::Client,
}

/// Unifies the three error families a command can surface (model-management,
/// inference, connector dispatch) behind one `Serialize`-able type, since a
/// Tauri command has exactly one error type.
#[derive(Debug, serde::Serialize)]
#[serde(tag = "kind", content = "error")]
enum CommandError {
    Model(models::ModelError),
    Inference(engine::InferenceError),
    Connector(connectors::runtime::ExecutionFailure),
    /// `secure_storage::VaultError` doesn't derive `Serialize` (nothing
    /// crossed the IPC boundary needing it before `set_search_connector_
    /// granted`, task 12.7's own addition) — carried as its message rather
    /// than adding a parallel manual `Serialize` impl for one command.
    Vault(String),
}

impl From<models::ModelError> for CommandError {
    fn from(e: models::ModelError) -> Self {
        CommandError::Model(e)
    }
}

impl From<engine::InferenceError> for CommandError {
    fn from(e: engine::InferenceError) -> Self {
        CommandError::Inference(e)
    }
}

impl From<connectors::runtime::ExecutionFailure> for CommandError {
    fn from(e: connectors::runtime::ExecutionFailure) -> Self {
        CommandError::Connector(e)
    }
}

impl From<secure_storage::VaultError> for CommandError {
    fn from(e: secure_storage::VaultError) -> Self {
        CommandError::Vault(e.to_string())
    }
}

#[tauri::command]
fn list_models(state: tauri::State<AppState>) -> Vec<models::ManagedModel> {
    state
        .manager
        .lock()
        .expect("model manager mutex poisoned")
        .list()
}

#[tauri::command]
fn list_installed_models(state: tauri::State<AppState>) -> Vec<models::InstalledModel> {
    state
        .manager
        .lock()
        .expect("model manager mutex poisoned")
        .list_installed()
}

#[tauri::command]
fn active_model_id(state: tauri::State<AppState>) -> Option<String> {
    state
        .manager
        .lock()
        .expect("model manager mutex poisoned")
        .active_model_id()
        .map(String::from)
}

#[tauri::command]
async fn install_model(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    // Fetch what's needed and release the lock before the `.await` below —
    // `std::sync::MutexGuard` cannot be held across an await point.
    let (descriptor, models_dir) = {
        let manager = state.manager.lock().expect("model manager mutex poisoned");
        (manager.descriptor(&id)?, manager.models_dir().to_path_buf())
    };

    let progress_app = app.clone();
    let phase_app = app.clone();
    let options = models::DownloadOptions {
        on_progress: Some(Box::new(move |p| {
            let _ = progress_app.emit("download-progress", &p);
        })),
        on_phase: Some(Box::new(move |p| {
            let _ = phase_app.emit("download-phase", &p);
        })),
        stall_timeout: None,
        cancel: None,
    };

    let client = reqwest::Client::new();
    models::download_model(&client, &models_dir, &descriptor, options).await?;
    Ok(())
}

#[tauri::command]
fn remove_model(state: tauri::State<AppState>, id: String) -> Result<(), CommandError> {
    Ok(state
        .manager
        .lock()
        .expect("model manager mutex poisoned")
        .remove(&id)?)
}

/// Loads `id`, releasing whatever the engine currently holds first. Runs on
/// Tauri's blocking thread pool (this is a plain, non-`async fn` command),
/// not the async runtime — `llama-cpp-2` calls are synchronous CPU work.
#[tauri::command]
fn load_model(
    state: tauri::State<AppState>,
    id: String,
) -> Result<engine::EngineInfo, CommandError> {
    let model_path: PathBuf = {
        let mut manager = state.manager.lock().expect("model manager mutex poisoned");
        manager.prepare_switch(&id)?
    };

    let info = {
        let mut engine = state.engine.lock().expect("engine mutex poisoned");
        engine.load(engine::LoadOptions {
            model_path,
            ..Default::default()
        })?
    };

    state
        .manager
        .lock()
        .expect("model manager mutex poisoned")
        .mark_active(Some(&id));
    Ok(info)
}

#[tauri::command]
fn unload_model(state: tauri::State<AppState>) {
    state.engine.lock().expect("engine mutex poisoned").unload();
}

#[tauri::command]
fn engine_info(state: tauri::State<AppState>) -> Option<engine::EngineInfo> {
    state
        .engine
        .lock()
        .expect("engine mutex poisoned")
        .engine_info()
}

#[derive(serde::Deserialize)]
struct GenerateRequest {
    messages: Vec<engine::ChatMessage>,
    #[serde(default)]
    max_tokens: Option<u32>,
    #[serde(default)]
    temperature: Option<f32>,
    #[serde(default)]
    stop: Option<Vec<String>>,
}

/// Streams tokens as `generate-token` events while it runs, then returns the
/// final `GenerateResult`. Also a plain (non-`async fn`) command — the
/// per-token event forwarding happens on a helper thread so this command's
/// own blocking thread can run the decode loop uninterrupted.
#[tauri::command]
fn generate(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    request: GenerateRequest,
) -> Result<engine::GenerateResult, CommandError> {
    let cancel = CancellationToken::new();
    *state.cancel.lock().expect("cancel mutex poisoned") = Some(cancel.clone());

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let token_app = app.clone();
    let forwarder = std::thread::spawn(move || {
        for token in rx {
            let _ = token_app.emit("generate-token", &token);
        }
    });

    let options = engine::GenerateOptions {
        messages: request.messages,
        max_tokens: request.max_tokens.unwrap_or(512),
        temperature: request.temperature.unwrap_or(0.7),
        stop: request.stop.unwrap_or_default(),
        ..Default::default()
    };

    let result = {
        let mut engine = state.engine.lock().expect("engine mutex poisoned");
        engine.generate(options, Some(tx), Some(cancel))
    };

    *state.cancel.lock().expect("cancel mutex poisoned") = None;
    // Dropping the sender (above, when `tx` goes out of scope) closes the
    // channel so the forwarder thread's `for token in rx` loop ends.
    let _ = forwarder.join();

    Ok(result?)
}

#[tauri::command]
fn cancel_generation(state: tauri::State<AppState>) {
    if let Some(cancel) = state.cancel.lock().expect("cancel mutex poisoned").as_ref() {
        cancel.cancel();
    }
}

/// Task 12.5's proof-of-life Tier 3 connector — see
/// `connectors::runtime::native_handlers`'s own doc comment for why
/// `device.info` exists. Gated twice, "belt-and-braces" per
/// `core-port.md`'s own deliverable text: `execute_connector_call` checks
/// `connectors::permissions::is_allowed` internally (the same in-app grant
/// this command shares with any future internal caller), and this command's
/// own entry in `capabilities/default.json` — enforced by `build.rs`'s
/// `AppManifest::commands` — is Tauri's independent IPC-level gate.
#[tauri::command]
async fn device_info(state: tauri::State<'_, AppState>) -> Result<String, CommandError> {
    let manifest_json: serde_json::Value =
        serde_json::from_str(connectors::manifest::fixtures::DEVICE_INFO_MANIFEST_JSON)
            .expect("the embedded device-info fixture is valid JSON");
    let manifest: connectors::manifest::ConnectorManifest =
        match connectors::manifest::validate_manifest(&manifest_json) {
            connectors::manifest::ValidationResult::Valid(manifest) => *manifest,
            connectors::manifest::ValidationResult::Invalid(issues) => {
                panic!("the embedded device-info fixture failed validation: {issues:?}")
            }
        };

    let result = connectors::runtime::execute_connector_call(
        &state.connector_http_client,
        &manifest,
        &serde_json::json!({}),
        &state.connectors_dir,
    )
    .await;

    match result {
        connectors::runtime::ExecutionResult::Ok { text } => Ok(text),
        connectors::runtime::ExecutionResult::Err(failure) => Err(failure.into()),
    }
}

/// `off` / `auto` / `required`, mirroring mobile's `connectorMode` — the
/// same three-way knob `ChatScreen.send` computes per message (plain chat
/// vs. a writing-assist mode vs. Search mode), except desktop's task 12.7
/// chat UI (not built yet) will pass this explicitly rather than deriving
/// it from a mode system that doesn't exist here yet.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum ConnectorMode {
    Off,
    Auto,
    Required,
}

fn default_connector_mode() -> ConnectorMode {
    ConnectorMode::Auto
}

/// Task 13.6 replaces the static embedded fixture with a manifest built
/// from real, user-entered config (`connectors::search::read_search_config`)
/// — `None` when the user hasn't configured Search yet, mirroring mobile's
/// own `installedConnectors()` returning `[]` in that case. Shared by
/// `generate_chat`, `connector_status`, and `set_search_connector_granted`
/// so there is one read+build site, not three copies to drift apart.
fn search_connector_manifest(
    connectors_dir: &std::path::Path,
) -> Option<connectors::manifest::ConnectorManifest> {
    let config = connectors::search::read_search_config(connectors_dir)?;
    let manifest = match config {
        connectors::search::SearchConfig::Searxng { url } => {
            connectors::search::build_searxng_manifest(&url)
        }
        connectors::search::SearchConfig::Tavily => connectors::search::tavily_manifest(),
    };
    Some(connectors::manifest::ConnectorManifest::Tier1(manifest))
}

#[derive(serde::Deserialize)]
struct GenerateChatRequest {
    messages: Vec<engine::ChatMessage>,
    #[serde(default)]
    max_tokens: Option<u32>,
    #[serde(default)]
    temperature: Option<f32>,
    #[serde(default = "default_connector_mode")]
    connector_mode: ConnectorMode,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateChatResponse {
    text: String,
    connector: Option<String>,
}

/// Task 12.7a's own command: the connector-aware counterpart to `generate`.
/// `off` skips tool-calling entirely (the existing plain-generation path,
/// wrapped in the same `{text, connector: null}` shape); `auto`/`required`
/// route through `connectors::orchestration::generate_with_connectors`
/// against the embedded Search fixture — desktop has no real
/// connector-install flow yet (Phase 3 on mobile), so, like mobile's own
/// `ModelSessionProvider.installedConnectors()` before that flow existed,
/// this is the one connector this app currently knows about, offered
/// regardless of its grant state (`is_allowed` inside routing/execution is
/// what actually gates it).
#[tauri::command]
fn generate_chat(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    request: GenerateChatRequest,
) -> Result<GenerateChatResponse, CommandError> {
    let cancel = CancellationToken::new();
    *state.cancel.lock().expect("cancel mutex poisoned") = Some(cancel.clone());

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let token_app = app.clone();
    let forwarder = std::thread::spawn(move || {
        for token in rx {
            let _ = token_app.emit("generate-token", &token);
        }
    });

    let max_tokens = request.max_tokens.unwrap_or(512);
    let temperature = request.temperature.unwrap_or(0.7);

    let result: Result<connectors::orchestration::ChatGenerateResult, engine::InferenceError> =
        if matches!(request.connector_mode, ConnectorMode::Off) {
            let mut engine = state.engine.lock().expect("engine mutex poisoned");
            engine
                .generate(
                    engine::GenerateOptions {
                        messages: request.messages,
                        max_tokens,
                        temperature,
                        ..Default::default()
                    },
                    Some(tx),
                    Some(cancel),
                )
                .map(|r| connectors::orchestration::ChatGenerateResult {
                    text: r.text,
                    connector: None,
                })
        } else {
            let manifests: Vec<_> = search_connector_manifest(&state.connectors_dir)
                .into_iter()
                .collect();
            let tool_choice = match request.connector_mode {
                ConnectorMode::Required => engine::ToolChoice::Required,
                _ => engine::ToolChoice::Auto,
            };

            let mut engine = state.engine.lock().expect("engine mutex poisoned");
            connectors::orchestration::generate_with_connectors(
                &mut *engine,
                &state.connector_http_client,
                &state.connectors_dir,
                &manifests,
                request.messages,
                connectors::orchestration::GenerateWithConnectorsOptions {
                    temperature,
                    max_tokens,
                    tool_choice,
                    on_token: Some(tx),
                    cancel: Some(cancel),
                },
            )
        };

    *state.cancel.lock().expect("cancel mutex poisoned") = None;
    // Dropping the sender (above, when `tx` goes out of scope) closes the
    // channel so the forwarder thread's `for token in rx` loop ends.
    let _ = forwarder.join();

    let result = result?;
    Ok(GenerateChatResponse {
        text: result.text,
        connector: result.connector,
    })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectorStatus {
    id: String,
    name: String,
    granted: bool,
}

fn connector_status_for(
    manifest: &connectors::manifest::ConnectorManifest,
    connectors_dir: &std::path::Path,
) -> ConnectorStatus {
    ConnectorStatus {
        id: manifest.id().to_string(),
        name: manifest.name().to_string(),
        granted: connectors::permissions::is_allowed(connectors_dir, manifest),
    }
}

/// Task 12.7's original single-connector lever, kept as-is for
/// `ChatScreen.tsx`'s own inline `Toggle` — task 13.5 removes that inline
/// control and switches Chat to linking out to the real Connectors screen
/// (`list_connectors`/`set_connector_granted` below); until then, two
/// small commands is less risk than rewriting a working, already-verified
/// one to fit a shape it doesn't need yet.
/// Task 13.6: an unconfigured Search reads as `granted: false`, the same
/// framing "not configured" and "not granted" already share everywhere
/// else — `ChatScreen.tsx`'s existing header indicator renders "Search:
/// Off" correctly for this case with no frontend change needed.
#[tauri::command]
fn connector_status(state: tauri::State<AppState>) -> ConnectorStatus {
    match search_connector_manifest(&state.connectors_dir) {
        Some(manifest) => connector_status_for(&manifest, &state.connectors_dir),
        None => ConnectorStatus {
            id: connectors::search::CONNECTOR_ID.to_string(),
            name: "Search".to_string(),
            granted: false,
        },
    }
}

#[tauri::command]
fn set_search_connector_granted(
    state: tauri::State<AppState>,
    granted: bool,
) -> Result<ConnectorStatus, CommandError> {
    let manifest = search_connector_manifest(&state.connectors_dir).ok_or_else(|| {
        CommandError::Connector(connectors::runtime::ExecutionFailure::with_detail(
            connectors::runtime::FailureReason::InvalidArguments,
            "Search is not configured yet".to_string(),
        ))
    })?;
    if granted {
        connectors::permissions::grant(&state.connectors_dir, &manifest);
    } else {
        connectors::permissions::revoke(&state.connectors_dir, &manifest)?;
    }
    Ok(connector_status_for(&manifest, &state.connectors_dir))
}

/// Every connector this app currently knows about — today, just Search,
/// and only once it's been configured (task 13.6); empty otherwise,
/// mirroring mobile's own `installedConnectors()` returning `[]` when
/// unconfigured. A real connector-install flow (Phase 3 on mobile) would
/// add more entries here; until then this is the one place task 13.3's
/// screen and any future caller look, so there is exactly one list to
/// keep in sync as connectors are added, not one per command.
fn known_connector_manifests(
    connectors_dir: &std::path::Path,
) -> Vec<connectors::manifest::ConnectorManifest> {
    search_connector_manifest(connectors_dir)
        .into_iter()
        .collect()
}

/// Task 13.3's own command: the real Connectors screen reads this instead
/// of `connector_status`'s single hardcoded row — built as a real list
/// against `known_connector_manifests()` so the screen doesn't need
/// rewriting when a second connector eventually exists. Empty until
/// Search is configured (task 13.6) — the frontend's own empty-state row
/// is what invites the user to fix that, not this command pretending
/// something exists that doesn't.
#[tauri::command]
fn list_connectors(state: tauri::State<AppState>) -> Vec<ConnectorStatus> {
    known_connector_manifests(&state.connectors_dir)
        .iter()
        .map(|manifest| connector_status_for(manifest, &state.connectors_dir))
        .collect()
}

#[tauri::command]
fn set_connector_granted(
    state: tauri::State<AppState>,
    id: String,
    granted: bool,
) -> Result<ConnectorStatus, CommandError> {
    let manifest = known_connector_manifests(&state.connectors_dir)
        .into_iter()
        .find(|m| m.id() == id)
        .ok_or_else(|| {
            CommandError::Connector(connectors::runtime::ExecutionFailure::with_detail(
                connectors::runtime::FailureReason::InvalidArguments,
                format!("no known connector with id \"{id}\""),
            ))
        })?;
    if granted {
        connectors::permissions::grant(&state.connectors_dir, &manifest);
    } else {
        connectors::permissions::revoke(&state.connectors_dir, &manifest)?;
    }
    Ok(connector_status_for(&manifest, &state.connectors_dir))
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum SearchProvider {
    Searxng,
    Tavily,
}

#[derive(serde::Deserialize)]
struct SearchConnectorConfigRequest {
    provider: SearchProvider,
    #[serde(default)]
    searxng_url: Option<String>,
    #[serde(default)]
    tavily_key: Option<String>,
}

/// Task 13.6's own save flow, mirroring mobile's `SearchSetupScreen.save()`
/// step-for-step: build the candidate manifest, run the existing
/// cross-field validator against it (catches a non-https/malformed
/// SearXNG URL with the same checks mobile relies on — no new validation
/// logic invented here), an extra Tavily-key-non-empty check matching
/// mobile's own literal copy, then — only once both pass — the vault
/// write (Tavily only), the non-secret config write, and the grant.
/// Extracted from the `#[tauri::command]` wrapper below so it's callable
/// directly from tests without a full Tauri command context, the same
/// reason `connector_status_for` is its own function.
fn save_search_connector_config(
    connectors_dir: &std::path::Path,
    request: SearchConnectorConfigRequest,
) -> Result<ConnectorStatus, CommandError> {
    let (manifest, config) = match request.provider {
        SearchProvider::Searxng => {
            let url = request.searxng_url.unwrap_or_default().trim().to_string();
            (
                connectors::search::build_searxng_manifest(&url),
                connectors::search::SearchConfig::Searxng { url },
            )
        }
        SearchProvider::Tavily => (
            connectors::search::tavily_manifest(),
            connectors::search::SearchConfig::Tavily,
        ),
    };

    let manifest_json = serde_json::to_value(&manifest).expect("manifest serializes to JSON");
    if let connectors::manifest::ValidationResult::Invalid(issues) =
        connectors::manifest::validate_manifest(&manifest_json)
    {
        let message = issues
            .first()
            .map(|i| i.message.clone())
            .unwrap_or_else(|| "That configuration is not valid.".to_string());
        return Err(CommandError::Connector(
            connectors::runtime::ExecutionFailure::with_detail(
                connectors::runtime::FailureReason::InvalidArguments,
                message,
            ),
        ));
    }

    if matches!(config, connectors::search::SearchConfig::Tavily) {
        let key = request.tavily_key.unwrap_or_default();
        let key = key.trim();
        if key.is_empty() {
            return Err(CommandError::Connector(
                connectors::runtime::ExecutionFailure::with_detail(
                    connectors::runtime::FailureReason::InvalidArguments,
                    "Enter your Tavily API key.".to_string(),
                ),
            ));
        }
        secure_storage::open_vault(connectors::search::CONNECTOR_ID)?
            .write("apiKey", &format!("Bearer {key}"))?;
    }

    connectors::search::write_search_config(connectors_dir, &config);
    let manifest = connectors::manifest::ConnectorManifest::Tier1(manifest);
    connectors::permissions::grant(connectors_dir, &manifest);
    Ok(connector_status_for(&manifest, connectors_dir))
}

#[tauri::command]
fn set_search_connector_config(
    state: tauri::State<AppState>,
    request: SearchConnectorConfigRequest,
) -> Result<ConnectorStatus, CommandError> {
    save_search_connector_config(&state.connectors_dir, request)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Task 14.3's own plugins — the first `.plugin(...)` calls in this
        // codebase. `tauri-plugin-updater` supplies `check()`/
        // `downloadAndInstall()` to the frontend; `tauri-plugin-process`
        // supplies `relaunch()`, which the updater plugin itself doesn't
        // include, needed to actually apply a downloaded update.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve the app data directory");
            let models_dir = models::models_directory(&app_data_dir)
                .expect("could not create the models directory");
            let connectors_dir = connectors::permissions::grants_directory(&app_data_dir)
                .expect("could not create the connectors directory");

            let engine = Arc::new(Mutex::new(
                engine::EngineAdapter::new().expect("could not initialize the inference backend"),
            ));
            let manager = models::ModelManager::new(models_dir, Some(engine.clone()));

            app.manage(AppState {
                manager: Mutex::new(manager),
                engine,
                cancel: Mutex::new(None),
                connectors_dir,
                connector_http_client: connectors::runtime::client(),
            });

            // Best-effort startup bootstrap, mirroring mobile's
            // `ModelSessionProvider` mounting behaviour: load whichever
            // model was last chosen (or the first installed one) so a
            // relaunch doesn't start with no model loaded. Off the setup
            // thread since a multi-hundred-MB model load must not block the
            // window from appearing; a failure here just leaves nothing
            // loaded rather than blocking startup.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state = handle.state::<AppState>();
                let preferred = state
                    .manager
                    .lock()
                    .expect("model manager mutex poisoned")
                    .preferred_model_id();
                let Some(id) = preferred else { return };

                let path = match state
                    .manager
                    .lock()
                    .expect("model manager mutex poisoned")
                    .prepare_switch(&id)
                {
                    Ok(path) => path,
                    Err(error) => {
                        eprintln!("startup bootstrap: could not prepare '{id}': {error}");
                        return;
                    }
                };
                let loaded =
                    state
                        .engine
                        .lock()
                        .expect("engine mutex poisoned")
                        .load(engine::LoadOptions {
                            model_path: path,
                            ..Default::default()
                        });
                match loaded {
                    Ok(_) => state
                        .manager
                        .lock()
                        .expect("model manager mutex poisoned")
                        .mark_active(Some(&id)),
                    Err(error) => eprintln!("startup bootstrap: could not load '{id}': {error}"),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_models,
            list_installed_models,
            active_model_id,
            install_model,
            remove_model,
            load_model,
            unload_model,
            engine_info,
            generate,
            cancel_generation,
            device_info,
            generate_chat,
            connector_status,
            set_search_connector_granted,
            list_connectors,
            set_connector_granted,
            set_search_connector_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sovereign Edge desktop");
}

#[cfg(test)]
mod search_connector_config_tests {
    use super::*;

    // Same hand-rolled scratch-dir pattern `connectors::permissions::grants`'s
    // and `connectors::search::config`'s own tests use.
    fn unique_suffix() -> String {
        static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("{}-{n}", std::process::id())
    }

    fn scratch_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-search-connector-config-test-{}",
            unique_suffix()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn use_mock_keyring() {
        secure_storage::vault::use_test_keyring_backend();
    }

    /// The mock keyring backend is process-global, and both providers
    /// share one real connector id by design (see `connectors::search::
    /// manifest`'s own doc comment) — unlike `vault.rs`'s own tests, which
    /// can each open a *fresh* unique id to avoid collisions, these two
    /// tests must exercise the literal production id, so they're
    /// serialized against each other instead.
    static VAULT_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn error_message(err: &CommandError) -> String {
        match err {
            CommandError::Connector(failure) => failure
                .detail
                .clone()
                .unwrap_or_else(|| format!("{failure:?}")),
            other => format!("{other:?}"),
        }
    }

    #[test]
    fn rejects_empty_searxng_url() {
        let dir = scratch_dir();
        let err = save_search_connector_config(
            &dir,
            SearchConnectorConfigRequest {
                provider: SearchProvider::Searxng,
                searxng_url: None,
                tavily_key: None,
            },
        )
        .unwrap_err();
        assert!(
            error_message(&err).contains("valid URL"),
            "{}",
            error_message(&err)
        );
        assert_eq!(connectors::search::read_search_config(&dir), None);
    }

    #[test]
    fn rejects_non_https_searxng_url() {
        let dir = scratch_dir();
        let err = save_search_connector_config(
            &dir,
            SearchConnectorConfigRequest {
                provider: SearchProvider::Searxng,
                searxng_url: Some("http://searx.example.org".to_string()),
                tavily_key: None,
            },
        )
        .unwrap_err();
        assert!(
            error_message(&err).contains("https"),
            "{}",
            error_message(&err)
        );
        assert_eq!(connectors::search::read_search_config(&dir), None);
    }

    #[test]
    fn valid_searxng_url_saves_config_and_grants_with_no_vault_write() {
        let _guard = VAULT_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        use_mock_keyring();
        secure_storage::open_vault(connectors::search::CONNECTOR_ID)
            .unwrap()
            .clear(&["apiKey".to_string()])
            .unwrap();
        let dir = scratch_dir();
        let status = save_search_connector_config(
            &dir,
            SearchConnectorConfigRequest {
                provider: SearchProvider::Searxng,
                searxng_url: Some("https://searx.example.org".to_string()),
                tavily_key: None,
            },
        )
        .expect("valid config saves");

        assert!(status.granted);
        assert_eq!(
            connectors::search::read_search_config(&dir),
            Some(connectors::search::SearchConfig::Searxng {
                url: "https://searx.example.org".to_string()
            })
        );
        // No vault write for SearXNG — it has no credential at all.
        let vault = secure_storage::open_vault(connectors::search::CONNECTOR_ID).unwrap();
        assert_eq!(vault.read("apiKey").unwrap(), None);
    }

    #[test]
    fn rejects_empty_tavily_key() {
        let dir = scratch_dir();
        let err = save_search_connector_config(
            &dir,
            SearchConnectorConfigRequest {
                provider: SearchProvider::Tavily,
                searxng_url: None,
                tavily_key: None,
            },
        )
        .unwrap_err();
        assert_eq!(error_message(&err), "Enter your Tavily API key.");
        assert_eq!(connectors::search::read_search_config(&dir), None);
    }

    #[test]
    fn valid_tavily_key_writes_vault_and_config() {
        let _guard = VAULT_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        use_mock_keyring();
        let dir = scratch_dir();
        let status = save_search_connector_config(
            &dir,
            SearchConnectorConfigRequest {
                provider: SearchProvider::Tavily,
                searxng_url: None,
                tavily_key: Some("tvly-abc123".to_string()),
            },
        )
        .expect("valid config saves");

        assert!(status.granted);
        assert_eq!(
            connectors::search::read_search_config(&dir),
            Some(connectors::search::SearchConfig::Tavily)
        );
        let vault = secure_storage::open_vault(connectors::search::CONNECTOR_ID).unwrap();
        assert_eq!(
            vault.read("apiKey").unwrap(),
            Some("Bearer tvly-abc123".to_string())
        );
    }
}
