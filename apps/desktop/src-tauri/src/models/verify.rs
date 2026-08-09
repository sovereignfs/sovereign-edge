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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    // Well-known test vectors for the literal bytes "hello world" — not
    // invented, not computed circularly from the code under test.
    const CONTENT: &[u8] = b"hello world";
    const SHA256: &str = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
    const MD5: &str = "5eb63bbbe01eeed093cb22bb8f5acdc3";

    fn scratch_file(label: &str, content: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-verify-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
        ));
        std::fs::create_dir_all(&dir).expect("could not create scratch dir");
        let path = dir.join("file.bin");
        let mut file = std::fs::File::create(&path).expect("could not create scratch file");
        file.write_all(content)
            .expect("could not write scratch file");
        path
    }

    fn descriptor(size_bytes: u64, md5: Option<&str>, sha256: Option<&str>) -> ModelDescriptor {
        ModelDescriptor {
            id: "scratch-verify-model".to_string(),
            name: "Scratch".to_string(),
            url: "https://example.org/scratch.gguf".to_string(),
            size_bytes,
            md5: md5.map(String::from),
            sha256: sha256.map(String::from),
            quantization: None,
        }
    }

    #[test]
    fn assert_verifiable_rejects_a_descriptor_with_no_checksum_at_all() {
        let d = descriptor(11, None, None);
        let error = assert_verifiable(&d).expect_err("no checksum must be rejected");
        assert_eq!(error.code, ModelErrorCode::VerificationUnavailable);
    }

    #[test]
    fn assert_verifiable_accepts_md5_only() {
        assert!(assert_verifiable(&descriptor(11, Some(MD5), None)).is_ok());
    }

    #[test]
    fn assert_verifiable_accepts_sha256_only() {
        assert!(assert_verifiable(&descriptor(11, None, Some(SHA256))).is_ok());
    }

    #[test]
    fn verify_file_succeeds_with_correct_size_and_sha256() {
        let path = scratch_file("sha-ok", CONTENT);
        let d = descriptor(CONTENT.len() as u64, None, Some(SHA256));
        assert!(verify_file(&path, &d).is_ok());
    }

    #[test]
    fn verify_file_rejects_a_wrong_sha256() {
        let path = scratch_file("sha-bad", CONTENT);
        let d = descriptor(CONTENT.len() as u64, None, Some(&"0".repeat(64)));
        let error = verify_file(&path, &d).expect_err("wrong sha256 must be rejected");
        assert_eq!(error.code, ModelErrorCode::ChecksumMismatch);
    }

    #[test]
    fn verify_file_succeeds_with_correct_size_and_md5() {
        let path = scratch_file("md5-ok", CONTENT);
        let d = descriptor(CONTENT.len() as u64, Some(MD5), None);
        assert!(verify_file(&path, &d).is_ok());
    }

    #[test]
    fn verify_file_rejects_a_wrong_md5() {
        let path = scratch_file("md5-bad", CONTENT);
        let d = descriptor(CONTENT.len() as u64, Some(&"0".repeat(32)), None);
        let error = verify_file(&path, &d).expect_err("wrong md5 must be rejected");
        assert_eq!(error.code, ModelErrorCode::ChecksumMismatch);
    }

    #[test]
    fn verify_file_rejects_a_size_mismatch_before_hashing() {
        let path = scratch_file("size-mismatch", CONTENT);
        let d = descriptor(CONTENT.len() as u64 + 1, None, Some(SHA256));
        let error = verify_file(&path, &d).expect_err("size mismatch must be rejected");
        assert_eq!(error.code, ModelErrorCode::SizeMismatch);
    }

    #[test]
    fn verify_file_reports_storage_error_for_a_missing_file() {
        let missing = std::env::temp_dir().join(format!(
            "sovereign-edge-desktop-verify-missing-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
        ));
        let d = descriptor(11, None, Some(SHA256));
        let error = verify_file(&missing, &d).expect_err("a missing file must fail");
        assert_eq!(error.code, ModelErrorCode::Storage);
    }
}
