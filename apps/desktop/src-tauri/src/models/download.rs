//! Downloads a model, verifies it, and installs it under its final name
//! (task 12.2, mirroring `apps/mobile/src/models/download.ts`).
//!
//! Resumes automatically: an interrupted multi-gigabyte download does not
//! restart from zero, because the already-written `.part` file's length is
//! itself the resume state (see `store.rs`'s doc comment for why desktop
//! needs no separate resume-state file the way mobile does).
//!
//! Every failure produces a `ModelError` with a specific `code`. The one
//! thing this must never do is hang: a download reporting no bytes for
//! longer than `stall_timeout` is treated as dead and reported rather than
//! left to wait on a TCP connection that is open but delivering nothing —
//! the silent-stuck-state failure epic task 0.4 exists to rule out.

use super::store::{assert_space_for, model_file, part_file};
use super::types::{DownloadPhase, DownloadProgress, ModelDescriptor, ModelError, ModelErrorCode};
use super::verify::{assert_verifiable, verify_file};
use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

const DEFAULT_STALL_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct DownloadOptions {
    pub on_progress: Option<Box<dyn Fn(DownloadProgress) + Send + Sync>>,
    pub on_phase: Option<Box<dyn Fn(DownloadPhase) + Send + Sync>>,
    pub stall_timeout: Option<Duration>,
    pub cancel: Option<CancellationToken>,
}

impl DownloadOptions {
    fn phase(&self, phase: DownloadPhase) {
        if let Some(cb) = &self.on_phase {
            cb(phase);
        }
    }

    fn progress(&self, progress: DownloadProgress) {
        if let Some(cb) = &self.on_progress {
            cb(progress);
        }
    }
}

pub async fn download_model(
    client: &reqwest::Client,
    models_dir: &Path,
    descriptor: &ModelDescriptor,
    options: DownloadOptions,
) -> Result<PathBuf, ModelError> {
    let installed = model_file(models_dir, &descriptor.id);
    if installed.exists() {
        options.phase(DownloadPhase::Done);
        return Ok(installed);
    }

    // Both checks are deliberately before the first byte moves — discovering
    // after a multi-gigabyte download that there was never enough space, or
    // that the file could not have been verified anyway, wastes bandwidth
    // the user may be paying for by the megabyte.
    assert_verifiable(descriptor)?;
    assert_space_for(models_dir, descriptor)?;

    let destination = part_file(models_dir, &descriptor.id);
    let stall_timeout = options.stall_timeout.unwrap_or(DEFAULT_STALL_TIMEOUT);

    match run_download(client, &destination, descriptor, &options, stall_timeout).await {
        Ok(()) => {}
        Err(error) => {
            options.phase(DownloadPhase::Failed);
            // A file that failed verification, or a deliberately cancelled
            // one, is worse than no file: it would sit there looking
            // resumable when it is not what the descriptor promises. A
            // stall, in contrast, keeps its bytes — the point of resuming.
            if matches!(
                error.code,
                ModelErrorCode::ChecksumMismatch
                    | ModelErrorCode::SizeMismatch
                    | ModelErrorCode::Cancelled
            ) {
                let _ = std::fs::remove_file(&destination);
            }
            return Err(error);
        }
    }

    options.phase(DownloadPhase::Verifying);
    if let Err(error) = verify_file(&destination, descriptor) {
        let _ = std::fs::remove_file(&destination);
        options.phase(DownloadPhase::Failed);
        return Err(error);
    }

    std::fs::rename(&destination, &installed).map_err(|cause| {
        ModelError::with_cause(
            ModelErrorCode::Storage,
            &descriptor.id,
            "Could not install the downloaded model.",
            cause,
        )
    })?;
    options.phase(DownloadPhase::Done);
    Ok(installed)
}

/// Streams the download into `destination`, resuming from whatever is
/// already there. On success the full file is on disk at `destination` (not
/// yet verified or renamed — the caller's job).
async fn run_download(
    client: &reqwest::Client,
    destination: &Path,
    descriptor: &ModelDescriptor,
    options: &DownloadOptions,
    stall_timeout: Duration,
) -> Result<(), ModelError> {
    let already_written = std::fs::metadata(destination).map(|m| m.len()).unwrap_or(0);

    let mut request = client.get(&descriptor.url);
    if already_written > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={already_written}-"));
    }

    let response = request.send().await.map_err(|cause| {
        ModelError::with_cause(
            ModelErrorCode::Network,
            &descriptor.id,
            format!("Download failed: {cause}"),
            cause,
        )
    })?;

    // The server may not support ranges and send the whole file back with a
    // 200 instead of a 206 — in that case the bytes we already have are for
    // a different offset than what's about to arrive, so start over.
    let resuming = already_written > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let total_bytes =
        response
            .content_length()
            .map(|len| if resuming { len + already_written } else { len });

    if !response.status().is_success() {
        return Err(ModelError::new(
            ModelErrorCode::Network,
            &descriptor.id,
            format!("Download failed: server returned {}.", response.status()),
        ));
    }

    let mut file = if resuming {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(destination)
            .await
    } else {
        tokio::fs::File::create(destination).await
    }
    .map_err(|cause| {
        ModelError::with_cause(
            ModelErrorCode::Storage,
            &descriptor.id,
            "Could not write the download to disk.",
            cause,
        )
    })?;

    let mut bytes_written = if resuming { already_written } else { 0 };
    options.phase(DownloadPhase::Downloading);

    let mut stream = response.bytes_stream();
    let mut last_progress_at = Instant::now();

    loop {
        if let Some(cancel) = &options.cancel {
            if cancel.is_cancelled() {
                return Err(ModelError::new(
                    ModelErrorCode::Cancelled,
                    &descriptor.id,
                    "Download was cancelled.",
                ));
            }
        }

        let remaining = stall_timeout.saturating_sub(last_progress_at.elapsed());
        let next = tokio::time::timeout(remaining, stream.next()).await;

        let chunk = match next {
            Err(_elapsed) => {
                return Err(ModelError::new(
                    ModelErrorCode::Stalled,
                    &descriptor.id,
                    format!(
                        "No data received for {}s. The download was left in place and can be resumed.",
                        stall_timeout.as_secs(),
                    ),
                ));
            }
            Ok(None) => break,
            Ok(Some(Err(cause))) => {
                return Err(ModelError::with_cause(
                    ModelErrorCode::Network,
                    &descriptor.id,
                    format!("Download failed: {cause}"),
                    cause,
                ));
            }
            Ok(Some(Ok(bytes))) => bytes,
        };

        file.write_all(&chunk).await.map_err(|cause| {
            ModelError::with_cause(
                ModelErrorCode::Storage,
                &descriptor.id,
                "Could not write the download to disk.",
                cause,
            )
        })?;

        bytes_written += chunk.len() as u64;
        last_progress_at = Instant::now();
        options.progress(DownloadProgress {
            bytes_written,
            total_bytes,
            fraction: total_bytes.map(|t| bytes_written as f64 / t as f64),
        });
    }

    file.flush().await.ok();
    Ok(())
}
