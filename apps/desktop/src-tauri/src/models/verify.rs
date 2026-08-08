//! Verifies a downloaded file against its descriptor (task 12.2, mirroring
//! `apps/mobile/src/models/verify.ts`).
//!
//! Checks run cheapest-first: size, then MD5 if present, then SHA-256 — size
//! is effectively free and catches the common failure (a truncated or
//! interrupted download) without spending any hashing time. SHA-256 is
//! preferred because it is the digest model publishers actually publish; an
//! MD5 can only come from a maintainer downloading the file and computing
//! it, which is a strictly weaker claim however fast.

use super::hashing::{md5_file, sha256_file};
use super::types::{ModelDescriptor, ModelError, ModelErrorCode};
use std::path::Path;

/// Throws unless this descriptor can actually be verified. Called *before* a
/// download starts as well as after it finishes — mobile's on-device testing
/// found that checking only at the end meant a checksum-less catalog entry
/// downloaded most of a multi-hundred-MB file before reporting it could
/// never have been verified. A size-only match is trivially satisfied by any
/// file of the right length, so passing one would make "verified" mean
/// almost nothing.
pub fn assert_verifiable(descriptor: &ModelDescriptor) -> Result<(), ModelError> {
    if descriptor.md5.is_some() || descriptor.sha256.is_some() {
        return Ok(());
    }
    Err(ModelError::new(
        ModelErrorCode::VerificationUnavailable,
        &descriptor.id,
        "This model carries no checksum, so a download cannot be verified.",
    ))
}

pub fn verify_file(path: &Path, descriptor: &ModelDescriptor) -> Result<(), ModelError> {
    assert_verifiable(descriptor)?;

    let actual_size = std::fs::metadata(path)
        .map_err(|cause| {
            ModelError::with_cause(
                ModelErrorCode::Storage,
                &descriptor.id,
                "Could not read the downloaded file to verify it.",
                cause,
            )
        })?
        .len();

    if actual_size != descriptor.size_bytes {
        return Err(ModelError::new(
            ModelErrorCode::SizeMismatch,
            &descriptor.id,
            format!(
                "Expected {} bytes but found {actual_size}. The download is incomplete or the source file changed.",
                descriptor.size_bytes,
            ),
        ));
    }

    if let Some(expected) = &descriptor.md5 {
        let actual = md5_file(path).map_err(|cause| {
            ModelError::with_cause(
                ModelErrorCode::Storage,
                &descriptor.id,
                "Could not hash the downloaded file.",
                cause,
            )
        })?;
        if actual.to_lowercase() != expected.to_lowercase() {
            return Err(ModelError::new(
                ModelErrorCode::ChecksumMismatch,
                &descriptor.id,
                format!(
                    "Checksum mismatch. Expected MD5 {expected} but computed {actual}. The file is corrupt or was not served by the expected source; it has not been kept.",
                ),
            ));
        }
    }

    if let Some(expected) = &descriptor.sha256 {
        let actual = sha256_file(path, |_| {}).map_err(|cause| {
            ModelError::with_cause(
                ModelErrorCode::Storage,
                &descriptor.id,
                "Could not hash the downloaded file.",
                cause,
            )
        })?;
        if actual.to_lowercase() != expected.to_lowercase() {
            return Err(ModelError::new(
                ModelErrorCode::ChecksumMismatch,
                &descriptor.id,
                format!("SHA-256 mismatch. Expected {expected} but computed {actual}. The file has not been kept."),
            ));
        }
    }

    Ok(())
}
