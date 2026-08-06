import type { File } from 'expo-file-system';

import { isNativeHashingAvailable, sha256File } from './hashing';
import { ModelError, type ModelDescriptor } from './types';

/**
 * Verification strategy.
 *
 * Measured on an Android emulator against a 128 MB file (research 0003):
 *
 *   native SHA-256 (this app's module)   fast — see epic task 0.5
 *   native MD5 (expo-file-system)        74.5 MB/s
 *   streamed SHA-256 in JavaScript        1.1 MB/s   → 4 GB in ~61 min
 *
 * SHA-256 is preferred because it is the digest model publishers actually
 * publish. An MD5 can only come from a maintainer downloading the file and
 * computing it, which certifies "matches what we downloaded" rather than
 * "matches what the publisher published" — strictly weaker, however fast.
 *
 * MD5 is still checked when a descriptor carries one: it costs almost
 * nothing, and it catches corruption early.
 */

export type VerifyOptions = {
  /**
   * Permit the slow JavaScript SHA-256 path when the native module is
   * unavailable. Without it, a SHA-256-only descriptor is refused rather than
   * silently taking an hour or passing on a size check alone.
   */
  deep?: boolean;
  onProgress?: (bytesHashed: number) => void;
};

/**
 * Throws unless this descriptor can actually be verified.
 *
 * Called *before* a download starts as well as after it finishes. On-device
 * testing showed why: checking only at the end meant a catalog entry with no
 * MD5 downloaded 277 MB of 800 MB and then reported that it could not be
 * verified — spending bandwidth the user may be paying for by the megabyte to
 * learn something knowable from the descriptor alone.
 *
 * A size-only match is trivially satisfied by any file of the right length,
 * so passing one would make "verified" mean almost nothing.
 */
export function assertVerifiable(
  descriptor: ModelDescriptor,
  deep: boolean,
): void {
  if (descriptor.md5) return;
  if (descriptor.sha256 && (isNativeHashingAvailable() || deep)) return;

  throw new ModelError(
    'verification-unavailable',
    descriptor.id,
    descriptor.sha256
      ? 'Native hashing is unavailable in this build, so this model can only ' +
          'be verified by the slow JavaScript path. Enable deep verification ' +
          'to proceed.'
      : 'This model carries no checksum, so a download cannot be verified.',
  );
}

/**
 * Verifies a downloaded file against its descriptor.
 *
 * Checks run cheapest-first: size, then MD5 if present, then SHA-256. Size is
 * effectively free and catches the common failure — a truncated or
 * interrupted download — without spending any hashing time.
 */
export async function verifyFile(
  file: File,
  descriptor: ModelDescriptor,
  options: VerifyOptions = {},
): Promise<void> {
  const deep = options.deep === true;
  assertVerifiable(descriptor, deep);

  const info = file.info({ md5: Boolean(descriptor.md5) });

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

  // Skipped only when the descriptor has no SHA-256, or when hashing it would
  // mean the slow path and the caller has not opted in.
  if (!descriptor.sha256) return;
  if (!isNativeHashingAvailable() && !deep) return;

  const actualSha = (await sha256File(file, options.onProgress)).toLowerCase();
  if (actualSha !== descriptor.sha256.toLowerCase()) {
    throw new ModelError(
      'checksum-mismatch',
      descriptor.id,
      `SHA-256 mismatch. Expected ${descriptor.sha256} but computed ` +
        `${actualSha}. The file has not been kept.`,
    );
  }
}
