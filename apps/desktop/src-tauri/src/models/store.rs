//! On-disk model layout (task 12.2, mirroring `apps/mobile/src/models/store.ts`).
//!
//! Models live under an OS data directory (resolved by the caller — `lib.rs`
//! uses Tauri's `app.path().app_data_dir()`; the integration test resolves
//! its own scratch directory), the desktop equivalent of mobile's choice to
//! use the document directory rather than a cache directory: the OS must
//! never be free to evict a multi-gigabyte download the user waited for.
//!
//! One deliberate simplification versus mobile: there is no separate
//! `*.resume.json` file. Mobile needed one because `expo-file-system`'s
//! `DownloadTask` requires an opaque, serialized `DownloadPauseState` to
//! resume. On desktop, `download.rs` resumes via a plain HTTP `Range`
//! request against however many bytes are already sitting in the `.part`
//! file — the partial file itself *is* the resume state, so persisting a
//! second copy of that fact would be redundant.

use super::types::{InstalledModel, ModelDescriptor, ModelError, ModelErrorCode};
use std::fs;
use std::path::{Path, PathBuf};

const MODEL_EXT: &str = ".gguf";
/// In-flight downloads carry this suffix so a partial file is never mistaken
/// for a usable model — the rename to the final name is the commit point.
const PART_EXT: &str = ".part";
const ACTIVE_FILENAME: &str = "active-model.json";

/// Ensures `base/models` exists and returns it.
pub fn models_directory(base: &Path) -> std::io::Result<PathBuf> {
    let dir = base.join("models");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn model_file(models_dir: &Path, id: &str) -> PathBuf {
    models_dir.join(format!("{id}{MODEL_EXT}"))
}

pub fn part_file(models_dir: &Path, id: &str) -> PathBuf {
    models_dir.join(format!("{id}{MODEL_EXT}{PART_EXT}"))
}

pub fn is_installed(models_dir: &Path, id: &str) -> bool {
    model_file(models_dir, id).is_file()
}

/// Every complete model on disk. Partial downloads are excluded.
pub fn list_installed(models_dir: &Path) -> Vec<InstalledModel> {
    let Ok(entries) = fs::read_dir(models_dir) else {
        return Vec::new();
    };

    entries
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let id = name.strip_suffix(MODEL_EXT)?.to_string();
            let size_bytes = e.metadata().map(|m| m.len()).unwrap_or(0);
            Some(InstalledModel {
                id,
                path: e.path().to_string_lossy().into_owned(),
                size_bytes,
                complete: true,
            })
        })
        .collect()
}

/// Deletes a model and any partial download for it, so a "delete to reclaim
/// space" action actually reclaims all of it.
pub fn remove_model(models_dir: &Path, id: &str) -> Result<(), ModelError> {
    for path in [model_file(models_dir, id), part_file(models_dir, id)] {
        if path.exists() {
            fs::remove_file(&path).map_err(|cause| {
                ModelError::with_cause(
                    ModelErrorCode::Storage,
                    id,
                    format!("Could not delete {}.", path.display()),
                    cause,
                )
            })?;
        }
    }
    Ok(())
}

/// Which model the user last chose, so the choice survives a relaunch.
///
/// The stored id is a hint, not a guarantee: returns `None` once the file it
/// names is gone, so a model deleted outside the app degrades to the same
/// behaviour as a first launch instead of failing to start.
pub fn read_active_model_id(models_dir: &Path) -> Option<String> {
    let path = models_dir.join(ACTIVE_FILENAME);
    let text = fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let id = value.get("id")?.as_str()?.to_string();
    if is_installed(models_dir, &id) {
        Some(id)
    } else {
        None
    }
}

pub fn write_active_model_id(models_dir: &Path, id: Option<&str>) {
    let path = models_dir.join(ACTIVE_FILENAME);
    // Losing the preference costs one wrong model on next launch, which the
    // user can correct. Failing the switch they just asked for is worse —
    // so, matching mobile, every error here is swallowed.
    match id {
        None => {
            let _ = fs::remove_file(path);
        }
        Some(id) => {
            let _ = fs::write(path, serde_json::json!({ "id": id }).to_string());
        }
    }
}

/// Free space on the filesystem that hosts `models_dir`.
pub fn available_space_bytes(models_dir: &Path) -> u64 {
    let mut disks = sysinfo::Disks::new_with_refreshed_list();
    disks.refresh();

    // Pick the disk whose mount point is the longest prefix of `models_dir`
    // — the most specific match, the same way the OS itself resolves which
    // filesystem a path lives on.
    disks
        .list()
        .iter()
        .filter(|d| models_dir.starts_with(d.mount_point()))
        .max_by_key(|d| d.mount_point().as_os_str().len())
        .map(|d| d.available_space())
        .unwrap_or(0)
}

/// Fails before starting rather than part-way through a long download.
///
/// The headroom accounts for the verification step, which reads the file but
/// writes nothing, and for the OS needing room to operate.
pub fn assert_space_for(models_dir: &Path, descriptor: &ModelDescriptor) -> Result<(), ModelError> {
    const HEADROOM_BYTES: u64 = 256 * 1024 * 1024;
    let available = available_space_bytes(models_dir);
    let needed = descriptor.size_bytes + HEADROOM_BYTES;

    if available < needed {
        let gb = |n: u64| n as f64 / 1e9;
        return Err(ModelError::new(
            ModelErrorCode::InsufficientSpace,
            &descriptor.id,
            format!(
                "Needs {:.1} GB free (model {:.1} GB plus working room) but only {:.1} GB is available.",
                gb(needed),
                gb(descriptor.size_bytes),
                gb(available),
            ),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-store-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
        ));
        fs::create_dir_all(&dir).expect("could not create scratch dir");
        dir
    }

    fn descriptor(id: &str, size_bytes: u64) -> ModelDescriptor {
        ModelDescriptor {
            id: id.to_string(),
            name: "Scratch".to_string(),
            url: "https://example.org/scratch.gguf".to_string(),
            size_bytes,
            md5: None,
            sha256: Some("0".repeat(64)),
            quantization: None,
        }
    }

    #[test]
    fn models_directory_creates_the_dir() {
        let base = scratch_dir("models-directory");
        let dir = models_directory(&base).expect("must create the models dir");
        assert!(dir.is_dir());
        assert_eq!(dir, base.join("models"));
    }

    #[test]
    fn model_file_and_part_file_have_the_expected_shape() {
        let dir = scratch_dir("paths");
        assert_eq!(model_file(&dir, "abc"), dir.join("abc.gguf"));
        assert_eq!(part_file(&dir, "abc"), dir.join("abc.gguf.part"));
    }

    #[test]
    fn is_installed_reflects_the_final_file_only() {
        let dir = scratch_dir("is-installed");
        assert!(!is_installed(&dir, "abc"));
        fs::write(part_file(&dir, "abc"), b"partial").unwrap();
        assert!(!is_installed(&dir, "abc"), "a .part file is not installed");
        fs::write(model_file(&dir, "abc"), b"complete").unwrap();
        assert!(is_installed(&dir, "abc"));
    }

    #[test]
    fn list_installed_excludes_part_files_and_reports_real_size() {
        let dir = scratch_dir("list-installed");
        fs::write(model_file(&dir, "abc"), b"12345").unwrap();
        fs::write(part_file(&dir, "def"), b"partial-only").unwrap();

        let installed = list_installed(&dir);
        assert_eq!(installed.len(), 1);
        assert_eq!(installed[0].id, "abc");
        assert_eq!(installed[0].size_bytes, 5);
        assert!(installed[0].complete);
    }

    #[test]
    fn remove_model_deletes_both_the_model_and_any_partial_file() {
        let dir = scratch_dir("remove");
        fs::write(model_file(&dir, "abc"), b"complete").unwrap();
        fs::write(part_file(&dir, "abc"), b"stale partial").unwrap();

        remove_model(&dir, "abc").expect("remove must succeed");

        assert!(!model_file(&dir, "abc").exists());
        assert!(!part_file(&dir, "abc").exists());
    }

    #[test]
    fn remove_model_is_a_no_op_when_neither_file_exists() {
        let dir = scratch_dir("remove-noop");
        assert!(remove_model(&dir, "never-existed").is_ok());
    }

    #[test]
    fn active_model_id_round_trips() {
        let dir = scratch_dir("active-round-trip");
        fs::write(model_file(&dir, "abc"), b"complete").unwrap();

        assert_eq!(read_active_model_id(&dir), None);
        write_active_model_id(&dir, Some("abc"));
        assert_eq!(read_active_model_id(&dir), Some("abc".to_string()));
    }

    #[test]
    fn active_model_id_degrades_to_none_when_the_stored_file_is_gone() {
        let dir = scratch_dir("active-degraded");
        fs::write(model_file(&dir, "abc"), b"complete").unwrap();
        write_active_model_id(&dir, Some("abc"));

        fs::remove_file(model_file(&dir, "abc")).unwrap();

        assert_eq!(
            read_active_model_id(&dir),
            None,
            "a stored id naming a file that no longer exists must degrade to None, not error"
        );
    }

    #[test]
    fn write_active_model_id_none_removes_the_stored_file() {
        let dir = scratch_dir("active-clear");
        fs::write(model_file(&dir, "abc"), b"complete").unwrap();
        write_active_model_id(&dir, Some("abc"));
        assert!(dir.join(ACTIVE_FILENAME).exists());

        write_active_model_id(&dir, None);
        assert!(!dir.join(ACTIVE_FILENAME).exists());
    }

    #[test]
    fn assert_space_for_succeeds_for_a_tiny_request() {
        let dir = scratch_dir("space-ok");
        assert!(assert_space_for(&dir, &descriptor("small", 1024)).is_ok());
    }

    #[test]
    fn assert_space_for_fails_for_an_absurd_request() {
        let dir = scratch_dir("space-bad");
        let error = assert_space_for(&dir, &descriptor("huge", u64::MAX / 2))
            .expect_err("an absurd request must fail against real disk space");
        assert_eq!(error.code, ModelErrorCode::InsufficientSpace);
    }
}
