import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { File } from 'expo-file-system';

/**
 * SHA-256 of a file, preferring the native implementation.
 *
 * There are two implementations because they are good at different things:
 *
 *  - **Native** (`modules/sovereign-hashing`) reads the file in 1 MB chunks
 *    through `CryptoKit` / `MessageDigest`. This is the one that makes
 *    verifying a real model practical.
 *  - **JavaScript** (`@noble/hashes`) measured 1.1 MB/s on device — about an
 *    hour per 4 GB. Kept as a fallback for when the native module is absent
 *    (Expo Go, a stale build, a platform without it) and as an independent
 *    check that the native one is correct.
 *
 * See research 0003 for the measurements and why the default changed.
 */

type NativeHashing = { sha256File(path: string): Promise<string> };

let nativeModule: NativeHashing | null | undefined;

/**
 * Resolved lazily and cached. A build that predates the native module throws
 * on import rather than at call time, so this must not run at module scope.
 */
function getNativeModule(): NativeHashing | null {
  if (nativeModule !== undefined) return nativeModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../../modules/sovereign-hashing/src/SovereignHashingModule');
    nativeModule = (mod.default ?? mod) as NativeHashing;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

export function isNativeHashingAvailable(): boolean {
  return getNativeModule() !== null;
}

/** SHA-256 in JavaScript. Slow; exported for fallback and cross-checking. */
export async function sha256FileJs(
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
 * SHA-256 of a file. Uses the native module when present.
 *
 * `onProgress` only fires on the JavaScript path — the native implementation
 * returns a single result rather than streaming progress, which is acceptable
 * precisely because it is fast enough not to need a progress bar.
 */
export async function sha256File(
  file: File,
  onProgress?: (bytesHashed: number) => void,
): Promise<string> {
  const native = getNativeModule();
  if (native) {
    return (await native.sha256File(file.uri)).toLowerCase();
  }
  return sha256FileJs(file, onProgress);
}
