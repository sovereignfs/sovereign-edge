//! Orchestration (task 12.2, mirroring `apps/mobile/src/models/manager.ts`).

use super::catalog::{curated_models, find_in_catalog, CatalogEntry};
use super::device::{fit_for_device, FitAssessment};
use super::store::{
    is_installed, list_installed, model_file, read_active_model_id, remove_model,
    write_active_model_id,
};
use super::types::{InstalledModel, ModelDescriptor, ModelError, ModelErrorCode};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Anything holding a model open. Mirrors mobile's `LoadedModelHandle` — kept
/// as a small trait rather than a concrete dependency on `crate::engine` so
/// this module stays usable without an inference engine present, matching
/// mobile's "the dependency runs one way" rationale exactly.
pub trait LoadedModelHandle: Send {
    fn is_loaded(&self) -> bool;
    fn unload(&mut self);
}

/// A model as presented in the manager UI: what it is, whether it is here,
/// and whether this machine can be expected to run it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedModel {
    #[serde(flatten)]
    pub entry: CatalogEntry,
    pub installed: bool,
    pub fit: FitAssessment,
}

/// Generic over the engine type (rather than a trait object) because
/// `std::sync::Mutex<T>` does not implement `CoerceUnsized` — an
/// `Arc<Mutex<Concrete>>` cannot be coerced to `Arc<Mutex<dyn Trait>>` on
/// stable Rust. A type parameter gets the same one-way-dependency seam via
/// monomorphization instead: this module never names `crate::engine`, and
/// `crate::engine::EngineAdapter` implements `LoadedModelHandle` without
/// this module knowing it exists.
pub struct ModelManager<E: LoadedModelHandle> {
    models_dir: PathBuf,
    engine: Option<Arc<Mutex<E>>>,
    /// Which model the engine currently holds, if any.
    active_id: Option<String>,
}

impl<E: LoadedModelHandle> ModelManager<E> {
    pub fn new(models_dir: PathBuf, engine: Option<Arc<Mutex<E>>>) -> Self {
        Self {
            models_dir,
            engine,
            active_id: None,
        }
    }

    /// The catalog, annotated for this machine.
    pub fn list(&self) -> Vec<ManagedModel> {
        curated_models()
            .into_iter()
            .map(|entry| {
                let installed = is_installed(&self.models_dir, &entry.descriptor.id);
                let fit = fit_for_device(&entry);
                ManagedModel {
                    entry,
                    installed,
                    fit,
                }
            })
            .collect()
    }

    /// Models on disk, including any no longer in the catalog.
    pub fn list_installed(&self) -> Vec<InstalledModel> {
        list_installed(&self.models_dir)
    }

    pub fn active_model_id(&self) -> Option<&str> {
        self.active_id.as_deref()
    }

    /// Deletes a model, releasing it first if the engine has it open.
    ///
    /// The release is the point: weights are memory-mapped while loaded, and
    /// removing the file underneath a live mapping is undefined behaviour
    /// rather than a clean failure.
    pub fn remove(&mut self, id: &str) -> Result<(), ModelError> {
        if self.active_id.as_deref() == Some(id) {
            if let Some(engine) = &self.engine {
                let mut engine = engine.lock().expect("engine mutex poisoned");
                if engine.is_loaded() {
                    engine.unload();
                }
            }
            self.active_id = None;
        }
        // Clear the stored choice whenever it names this model, including
        // when it was never loaded this session — otherwise the next launch
        // tries to load a file that is about to stop existing.
        if read_active_model_id(&self.models_dir).as_deref() == Some(id) {
            write_active_model_id(&self.models_dir, None);
        }
        remove_model(&self.models_dir, id)
    }

    /// Records which model the engine now holds, and persists the choice so
    /// the next launch loads it rather than whichever catalog entry happens
    /// to be installed first.
    pub fn mark_active(&mut self, id: Option<&str>) {
        self.active_id = id.map(String::from);
        write_active_model_id(&self.models_dir, id);
    }

    /// The model to load at startup: the one last chosen, or the first
    /// installed entry when there is no stored choice or the stored one is
    /// gone.
    pub fn preferred_model_id(&self) -> Option<String> {
        read_active_model_id(&self.models_dir).or_else(|| {
            self.list()
                .into_iter()
                .find(|m| m.installed)
                .map(|m| m.entry.descriptor.id)
        })
    }

    /// Prepares to switch models: releases the current one and returns the
    /// path the caller should load. Loading itself stays with the engine.
    pub fn prepare_switch(&mut self, id: &str) -> Result<PathBuf, ModelError> {
        self.require_entry(id)?;

        if !is_installed(&self.models_dir, id) {
            return Err(ModelError::new(
                ModelErrorCode::Storage,
                id,
                "That model is not installed. Download it before switching to it.",
            ));
        }

        if let Some(engine) = &self.engine {
            let mut engine = engine.lock().expect("engine mutex poisoned");
            if engine.is_loaded() {
                engine.unload();
            }
        }
        self.active_id = None;

        Ok(model_file(&self.models_dir, id))
    }

    pub fn models_dir(&self) -> &std::path::Path {
        &self.models_dir
    }

    /// The catalog descriptor for `id` — used by callers (e.g. the
    /// `install_model` Tauri command) that need to download outside this
    /// struct's own lock, since `download_model` is a long-running `.await`
    /// and holding a `std::sync::Mutex` guard across an await point is not
    /// something an async Tauri command can do.
    pub fn descriptor(&self, id: &str) -> Result<ModelDescriptor, ModelError> {
        Ok(self.require_entry(id)?.descriptor)
    }

    fn require_entry(&self, id: &str) -> Result<CatalogEntry, ModelError> {
        find_in_catalog(id).ok_or_else(|| {
            ModelError::new(ModelErrorCode::Storage, id, format!("Unknown model: {id}"))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::super::store::model_file;
    use super::*;

    /// Mirrors `connectors/routing/route.rs`'s own `FakeEngine` naming for
    /// an unrelated trait — same idea, a different seam: `LoadedModelHandle`
    /// exists specifically so tests don't need a real inference backend.
    struct FakeEngine {
        loaded: bool,
    }

    impl LoadedModelHandle for FakeEngine {
        fn is_loaded(&self) -> bool {
            self.loaded
        }
        fn unload(&mut self) {
            self.loaded = false;
        }
    }

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-manager-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
        ));
        std::fs::create_dir_all(&dir).expect("could not create scratch dir");
        dir
    }

    fn known_id() -> String {
        curated_models()[0].descriptor.id.clone()
    }

    fn manager_with_engine(
        models_dir: PathBuf,
        loaded: bool,
    ) -> (ModelManager<FakeEngine>, Arc<Mutex<FakeEngine>>) {
        let engine = Arc::new(Mutex::new(FakeEngine { loaded }));
        (ModelManager::new(models_dir, Some(engine.clone())), engine)
    }

    #[test]
    fn list_reflects_real_installed_state_from_disk() {
        let dir = scratch_dir("list");
        let id = known_id();
        std::fs::write(model_file(&dir, &id), b"complete").unwrap();

        let manager: ModelManager<FakeEngine> = ModelManager::new(dir, None);
        let listed = manager.list();

        let entry = listed.iter().find(|m| m.entry.descriptor.id == id).unwrap();
        assert!(entry.installed);
        assert!(
            listed.iter().any(|m| !m.installed),
            "at least one entry should be uninstalled in a fresh scratch dir"
        );
    }

    #[test]
    fn remove_unloads_the_engine_and_clears_the_stored_choice_only_for_the_active_model() {
        let dir = scratch_dir("remove-active");
        let id = known_id();
        std::fs::write(model_file(&dir, &id), b"complete").unwrap();

        let (mut manager, engine) = manager_with_engine(dir.clone(), true);
        manager.mark_active(Some(&id));
        assert_eq!(read_active_model_id(&dir), Some(id.clone()));

        manager.remove(&id).expect("remove must succeed");

        assert!(
            !engine.lock().unwrap().is_loaded(),
            "the active model's removal must unload the engine"
        );
        assert_eq!(manager.active_model_id(), None);
        assert_eq!(
            read_active_model_id(&dir),
            None,
            "the stored preference must be cleared too"
        );
        assert!(!model_file(&dir, &id).exists());
    }

    #[test]
    fn remove_leaves_the_engine_and_active_id_alone_when_the_removed_model_is_not_active() {
        let dir = scratch_dir("remove-inactive");
        let active_id = known_id();
        let other_id = curated_models()[1].descriptor.id.clone();
        std::fs::write(model_file(&dir, &active_id), b"complete").unwrap();
        std::fs::write(model_file(&dir, &other_id), b"complete").unwrap();

        let (mut manager, engine) = manager_with_engine(dir.clone(), true);
        manager.mark_active(Some(&active_id));

        manager.remove(&other_id).expect("remove must succeed");

        assert!(
            engine.lock().unwrap().is_loaded(),
            "removing a non-active model must not touch the engine"
        );
        assert_eq!(manager.active_model_id(), Some(active_id.as_str()));
        assert!(!model_file(&dir, &other_id).exists());
    }

    #[test]
    fn mark_active_and_preferred_model_id_round_trip() {
        let dir = scratch_dir("preferred-round-trip");
        let id = known_id();
        std::fs::write(model_file(&dir, &id), b"complete").unwrap();

        let mut manager: ModelManager<FakeEngine> = ModelManager::new(dir, None);
        manager.mark_active(Some(&id));

        assert_eq!(manager.preferred_model_id(), Some(id));
    }

    #[test]
    fn preferred_model_id_falls_back_to_the_first_installed_entry_with_no_stored_choice() {
        let dir = scratch_dir("preferred-fallback");
        let id = known_id();
        std::fs::write(model_file(&dir, &id), b"complete").unwrap();

        let manager: ModelManager<FakeEngine> = ModelManager::new(dir, None);
        assert_eq!(manager.preferred_model_id(), Some(id));
    }

    #[test]
    fn preferred_model_id_is_none_when_nothing_is_installed() {
        let dir = scratch_dir("preferred-none");
        let manager: ModelManager<FakeEngine> = ModelManager::new(dir, None);
        assert_eq!(manager.preferred_model_id(), None);
    }

    #[test]
    fn prepare_switch_rejects_an_unknown_model_id() {
        let dir = scratch_dir("switch-unknown");
        let mut manager: ModelManager<FakeEngine> = ModelManager::new(dir, None);
        let error = manager
            .prepare_switch("no-such-model")
            .expect_err("an unknown id must be rejected");
        assert_eq!(error.code, ModelErrorCode::Storage);
    }

    #[test]
    fn prepare_switch_rejects_a_known_but_uninstalled_model() {
        let dir = scratch_dir("switch-not-installed");
        let id = known_id();
        let mut manager: ModelManager<FakeEngine> = ModelManager::new(dir, None);
        let error = manager
            .prepare_switch(&id)
            .expect_err("an uninstalled model must be rejected");
        assert_eq!(error.code, ModelErrorCode::Storage);
    }

    #[test]
    fn prepare_switch_releases_the_engine_and_returns_the_model_path() {
        let dir = scratch_dir("switch-ok");
        let id = known_id();
        std::fs::write(model_file(&dir, &id), b"complete").unwrap();

        let (mut manager, engine) = manager_with_engine(dir.clone(), true);
        let path = manager.prepare_switch(&id).expect("switch must succeed");

        assert_eq!(path, model_file(&dir, &id));
        assert!(!engine.lock().unwrap().is_loaded());
        assert_eq!(manager.active_model_id(), None);
    }

    #[test]
    fn descriptor_returns_the_real_catalog_entry_for_a_known_id() {
        let dir = scratch_dir("descriptor-known");
        let id = known_id();
        let manager: ModelManager<FakeEngine> = ModelManager::new(dir, None);
        assert_eq!(manager.descriptor(&id).unwrap().id, id);
    }

    #[test]
    fn descriptor_rejects_an_unknown_id() {
        let dir = scratch_dir("descriptor-unknown");
        let manager: ModelManager<FakeEngine> = ModelManager::new(dir, None);
        let error = manager
            .descriptor("no-such-model")
            .expect_err("an unknown id must be rejected");
        assert_eq!(error.code, ModelErrorCode::Storage);
    }
}
