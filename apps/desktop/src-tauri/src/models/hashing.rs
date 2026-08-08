//! File hashing (task 12.2, mirroring `apps/mobile/src/models/hashing.ts`).
//!
//! Mobile's version chooses between a native module and a slow JavaScript
//! fallback. On desktop there is no such split: `sha2`/`md-5` (RustCrypto)
//! read the file in chunks natively, so there is exactly one path and it is
//! always the fast one — the reason `verify.rs`'s `assert_verifiable` no
//! longer needs an `isNativeHashingAvailable()`/`deep` bifurcation either.

use md5::Md5;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

const CHUNK_SIZE: usize = 1024 * 1024;

pub fn sha256_file(path: &Path, mut on_progress: impl FnMut(u64)) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHUNK_SIZE];
    let mut hashed = 0u64;

    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        hashed += n as u64;
        on_progress(hashed);
    }

    Ok(hex::encode(hasher.finalize()))
}

pub fn md5_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Md5::new();
    let mut buf = vec![0u8; CHUNK_SIZE];

    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }

    Ok(hex::encode(hasher.finalize()))
}
