//! Model asset pipeline (task 12.2), mirroring `apps/mobile/src/models/`.

pub mod catalog;
pub mod device;
pub mod download;
pub mod hashing;
pub mod manager;
pub mod store;
pub mod types;
pub mod verify;

// Mirrors `apps/mobile/src/models/index.ts`: the full public surface of this
// module, not just what `lib.rs`'s command set happens to call today —
// `#[allow]` because several of these (e.g. `CatalogEntry`, `ModelErrorCode`)
// are only reachable through other re-exported types' fields right now.
#[allow(unused_imports)]
pub use catalog::{curated_models, find_in_catalog, CatalogEntry};
#[allow(unused_imports)]
pub use device::{fit_for_device, FitAssessment};
pub use download::{download_model, DownloadOptions};
pub use manager::{LoadedModelHandle, ManagedModel, ModelManager};
pub use store::models_directory;
#[allow(unused_imports)]
pub use types::{
    DownloadPhase, DownloadProgress, InstalledModel, ModelDescriptor, ModelError, ModelErrorCode,
};
