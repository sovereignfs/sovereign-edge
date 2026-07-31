import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { File } from 'expo-file-system';

import { ModelError, type ModelDescriptor } from './types';

/**
 * Verification strategy, and why it is MD5 by default.
 *
 * Measured on an Android emulator against a 128 MB file (see research 0003):
 *
 *   native MD5                 74.5 MB/s   → 4 GB in ~1 min
 *   streamed SHA-256 in JS      1.1 MB/s   → 4 GB in ~61 min
 *
 * `expo-file-system` exposes native hashing for MD5 only, so SHA-256 has to
 * run in JS over a stream that arrives in 1 KB chunks. That is not a tuning
 * problem: hashing alone accounts for ~48 of those 61 minutes.
 *
 * MD5 is the right tool for this specific job despite its reputation. The
 * property being relied on is *second-preimage* resistance — given the
 * publisher's file and its published digest, produce a *different* file with
 * the same digest — for which MD5 has no practical attack. MD5's broken
 * property is *collision* resistance, where an attacker crafts two files
 * together; that only helps an attacker who controls the published digest,
 * i.e. a hostile publisher, which a stronger hash here would not fix either.
 *
 * The remaining gap is closed by a native SHA-256 module (a follow-up task):
 * until then `sha256` in a descriptor is verifiable via `deep: true`, at the
 * cost above.
 */

/**
 * Throws unless this descriptor can actually be verified under `deep`.
 *
 * Called *before* a download starts as well as after it finishes. On-device
 * testing showed why: checking only at the end meant a catalog entry with no
 * MD5 downloaded 800 MB and then reported that it could not be verified —
 * spending a user's bandwidth, and their mobile data, to learn something
 * knowable from the descriptor alone.
 *
 * A size-only match is trivially satisfied by any file of the right length,
 * so passing one would make "verified" mean almost nothing. Catalog entries
 * carry the publisher's SHA-256 but usually no MD5, so this is the path that
 * pushes callers to `deep` until native SHA-256 exists — see research 0003.
 */
export function assertVerifiable(
  descriptor: ModelDescriptor,
  deep: boolean,
): void {
  if (descriptor.md5) return;
  if (deep && descriptor.sha256) return;

  throw new ModelError(
    'verification-unavailable',
    descriptor.id,
    descriptor.sha256
      ? 'This model publishes only a SHA-256 digest, which cannot be checked ' +
          'quickly on device. Enable deep verification — slow, but thorough — ' +
          'before downloading it.'
      : 'This model carries no checksum, so a download cannot be verified.',
  );
}

export type VerifyOptions = {
  /**
   * Additionally verify SHA-256, when the descriptor carries one. Very slow —
   * see the note above. Off by default.
   */
  deep?: boolean;
  onProgress?: (bytesHashed: number) => void;
};

/**
 * SHA-256 of a file, hashed incrementally from its stream.
 *
 * Streamed rather than buffered because these files are gigabytes and
 * `expo-crypto`'s `digest()` takes a whole `BufferSource`. Retained for the
 * `deep` path and for a future native implementation to be checked against.
 */
export async function hashFile(
  file: File,
  onProgress?: (bytesHashed: number) => void,
): Promise<string> {
  const hasher = sha256.create();
  const reader = file.readableStream().getReader();
  let hashed = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        hasher.update(value);
        hashed += value.byteLength;
        onProgress?.(hashed);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return bytesToHex(hasher.digest());
}

/**
 * Verifies a downloaded file against its descriptor.
 *
 * Checks run cheapest-first: size, then native MD5, then (only when asked)
 * SHA-256. Size is effectively free and catches the common failure — a
 * truncated or interrupted download — without spending any hashing time.
 */
export async function verifyFile(
  file: File,
  descriptor: ModelDescriptor,
  options: VerifyOptions = {},
): Promise<void> {
  const wantsDeep = options.deep === true && Boolean(descriptor.sha256);

  assertVerifiable(descriptor, options.deep === true);

  const info = file.info({ md5: true });

  if (info.size !== descriptor.sizeBytes) {
    throw new ModelError(
      'size-mismatch',
      descriptor.id,
      `Expected ${descriptor.sizeBytes} bytes but found ${info.size ?? 0}. ` +
        `The download is incomplete or the source file changed.`,
    );
  }

  if (descriptor.md5) {
    const actualMd5 = info.md5?.toLowerCase();
    if (!actualMd5) {
      throw new ModelError(
        'storage',
        descriptor.id,
        'Could not read the downloaded file to verify it.',
      );
    }

    if (actualMd5 !== descriptor.md5.toLowerCase()) {
      throw new ModelError(
        'checksum-mismatch',
        descriptor.id,
        `Checksum mismatch. Expected MD5 ${descriptor.md5} but computed ` +
          `${actualMd5}. The file is corrupt or was not served by the ` +
          `expected source; it has not been kept.`,
      );
    }
  }

  if (!wantsDeep) return;

  const actualSha = await hashFile(file, options.onProgress);
  if (actualSha !== descriptor.sha256!.toLowerCase()) {
    throw new ModelError(
      'checksum-mismatch',
      descriptor.id,
      `SHA-256 mismatch. Expected ${descriptor.sha256} but computed ` +
        `${actualSha}. The file has not been kept.`,
    );
  }
}
