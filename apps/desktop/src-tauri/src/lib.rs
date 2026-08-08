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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sovereign Edge desktop");
}
