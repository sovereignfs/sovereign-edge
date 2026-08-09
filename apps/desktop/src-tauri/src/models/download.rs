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

    let response = crate::net_guard::allow_network(request.send())
        .await
        .map_err(|cause| {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::types::ModelDescriptor;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// Same hand-rolled local-server pattern as
    /// `tests/connector_dispatch.rs`/`tests/tool_calling_smoke.rs`: no
    /// mocking library in this repo, so cancellation gets proven against a
    /// real TCP connection rather than trusted from reading the code.
    /// Writes `chunks` one at a time, `pause` between each, so a test can
    /// cancel mid-stream with a real window to land the cancellation in.
    fn serve_slow_chunks(listener: TcpListener, chunks: Vec<&'static [u8]>, pause: Duration) {
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test server: accept failed");
            let mut buf = [0u8; 4096];
            let mut received = Vec::new();
            loop {
                let n = stream.read(&mut buf).expect("test server: read failed");
                received.extend_from_slice(&buf[..n]);
                if received.windows(4).any(|w| w == b"\r\n\r\n") || n == 0 {
                    break;
                }
            }
            let total: usize = chunks.iter().map(|c| c.len()).sum();
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {total}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(header.as_bytes()).is_err() {
                return;
            }
            for chunk in chunks {
                if stream.write_all(chunk).is_err() {
                    return; // The client closed the connection — expected once cancelled.
                }
                let _ = stream.flush();
                std::thread::sleep(pause);
            }
        });
    }

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-download-cancel-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
        ));
        std::fs::create_dir_all(&dir).expect("could not create scratch models dir");
        dir
    }

    fn scratch_descriptor(url: String) -> ModelDescriptor {
        ModelDescriptor {
            id: "scratch-cancel-model".to_string(),
            name: "Scratch Cancel Model".to_string(),
            url,
            // A real checksum value isn't needed — cancellation always
            // aborts before `verify_file` runs — but `assert_verifiable`
            // requires *a* checksum to be present at all before the
            // download starts, so this must be `Some`.
            size_bytes: 12,
            md5: None,
            sha256: Some("0".repeat(64)),
            quantization: None,
        }
    }

    #[tokio::test]
    async fn a_precancelled_token_stops_the_download_before_any_bytes_land() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("could not bind test server");
        let addr = listener.local_addr().expect("no local addr");
        serve_slow_chunks(listener, vec![b"hello world!"], Duration::from_secs(5));

        let models_dir = scratch_dir("precancelled");
        let descriptor = scratch_descriptor(format!("http://{addr}"));
        let cancel = CancellationToken::new();
        cancel.cancel();

        let client = crate::net_guard::guarded_client_builder()
            .build()
            .expect("client builds");
        let options = DownloadOptions {
            cancel: Some(cancel),
            ..Default::default()
        };
        let result = download_model(&client, &models_dir, &descriptor, options).await;

        let error = result.expect_err("a precancelled download must fail");
        assert_eq!(error.code, ModelErrorCode::Cancelled);
        assert!(
            !part_file(&models_dir, &descriptor.id).exists(),
            "a cancelled download must not leave a partial file behind"
        );
    }

    #[tokio::test]
    async fn cancelling_mid_stream_stops_the_download_and_deletes_the_partial_file() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("could not bind test server");
        let addr = listener.local_addr().expect("no local addr");
        // A slow second chunk gives the test a real window to cancel inside,
        // proving the cancellation check inside the streaming loop actually
        // fires mid-transfer, not just before the request is sent.
        serve_slow_chunks(
            listener,
            vec![b"first-chunk-", b"second-chunk"],
            Duration::from_millis(400),
        );

        let models_dir = scratch_dir("midstream");
        let descriptor = scratch_descriptor(format!("http://{addr}"));
        let cancel = CancellationToken::new();
        let progress_count = Arc::new(AtomicUsize::new(0));
        let progress_count_cb = progress_count.clone();
        let cancel_from_progress = cancel.clone();

        let options = DownloadOptions {
            on_progress: Some(Box::new(move |_| {
                // Cancel as soon as the first chunk's progress is reported —
                // the download is still streaming the second chunk at this
                // point, since the server sleeps between writes.
                if progress_count_cb.fetch_add(1, Ordering::SeqCst) == 0 {
                    cancel_from_progress.cancel();
                }
            })),
            cancel: Some(cancel),
            ..Default::default()
        };

        let client = crate::net_guard::guarded_client_builder()
            .build()
            .expect("client builds");
        let result = download_model(&client, &models_dir, &descriptor, options).await;

        let error = result.expect_err("a mid-stream cancel must fail the download");
        assert_eq!(error.code, ModelErrorCode::Cancelled);
        assert!(
            progress_count.load(Ordering::SeqCst) >= 1,
            "the first chunk's progress callback must have fired for this test to be meaningful"
        );
        assert!(
            !part_file(&models_dir, &descriptor.id).exists(),
            "a cancelled download must not leave a partial file behind"
        );
    }
}
