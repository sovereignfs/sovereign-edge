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
