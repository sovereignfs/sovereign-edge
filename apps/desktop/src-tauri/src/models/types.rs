//! Model asset pipeline — types (task 12.2).
//!
//! Mirrors `apps/mobile/src/models/types.ts`. Weights are never bundled into
//! the app binary; they are fetched at runtime to a user-visible,
//! user-deletable location (an OS data directory, resolved by `store.rs`).

use serde::Serialize;
use std::error::Error as StdError;
use std::fmt;

/// A downloadable GGUF model. Catalog entries are plain data, no code.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDescriptor {
    /// Stable identifier, also the on-disk filename stem.
    pub id: String,
    /// Human-readable name shown in the model manager.
    pub name: String,
    /// Direct download URL for the `.gguf` file.
    pub url: String,
    /// Exact expected size. Checked before hashing — a cheap truncation check.
    pub size_bytes: u64,
    /// Lowercase hex MD5, when someone has computed one. See `verify.rs` for
    /// why SHA-256 is preferred and this is only a cheap sanity check.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub md5: Option<String>,
    /// Lowercase hex SHA-256 as published by the model's author. Authoritative.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// e.g. `Q4_K_M`. Display only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantization: Option<String>,
}

/// A model present on disk, as reported by the store.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModel {
    pub id: String,
    pub path: String,
    pub size_bytes: u64,
    /// Whether the on-disk size matches the descriptor, when one is known.
    pub complete: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub bytes_written: u64,
    /// `None` when the server sends no `Content-Length`.
    pub total_bytes: Option<u64>,
    /// 0-1, or `None` when the total is unknown.
    pub fraction: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DownloadPhase {
    Downloading,
    Verifying,
    Done,
    Failed,
}

/// Why a download or model operation ended badly. Every failure path produces
/// one of these — the point of epic task 0.4's "never a silent stuck state"
/// requirement, carried over from mobile, is that a caller can always tell
/// the user something specific.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModelErrorCode {
    /// No progress for longer than the stall timeout.
    Stalled,
    /// Transport failed (offline, DNS, TLS, non-2xx).
    Network,
    /// Downloaded byte count does not match the descriptor.
    SizeMismatch,
    /// A digest does not match the descriptor.
    ChecksumMismatch,
    /// The descriptor carries no checksum at all, so a download cannot be
    /// verified. (Desktop always hashes at native speed — see `hashing.rs` —
    /// so unlike mobile there is no separate "native hashing unavailable"
    /// case; the only way verification is unavailable is no checksum.)
    VerificationUnavailable,
    /// Not enough free space to hold the model.
    InsufficientSpace,
    /// Caller cancelled deliberately.
    Cancelled,
    /// Filesystem refused a read or write.
    Storage,
}

/// Mirrors `apps/mobile/src/models/types.ts`'s `ModelError`.
#[derive(Debug)]
pub struct ModelError {
    pub code: ModelErrorCode,
    pub model_id: String,
    pub message: String,
    pub cause: Option<Box<dyn StdError + Send + Sync>>,
}

impl ModelError {
    pub fn new(
        code: ModelErrorCode,
        model_id: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            model_id: model_id.into(),
            message: message.into(),
            cause: None,
        }
    }

    pub fn with_cause(
        code: ModelErrorCode,
        model_id: impl Into<String>,
        message: impl Into<String>,
        cause: impl StdError + Send + Sync + 'static,
    ) -> Self {
        Self {
            code,
            model_id: model_id.into(),
            message: message.into(),
            cause: Some(Box::new(cause)),
        }
    }
}

impl fmt::Display for ModelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl StdError for ModelError {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        self.cause
            .as_ref()
            .map(|c| c.as_ref() as &(dyn StdError + 'static))
    }
}

// Manual `Serialize` (rather than `#[derive]`) because `cause` — a trait
// object — has no sensible wire representation; only `code`/`modelId`/
// `message` are meaningful to the frontend, the same three fields mobile's
// `ModelError` effectively exposes via its own `code`/`modelId`/`message`.
impl Serialize for ModelError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("ModelError", 3)?;
        s.serialize_field("code", &self.code)?;
        s.serialize_field("modelId", &self.model_id)?;
        s.serialize_field("message", &self.message)?;
        s.end()
    }
}
