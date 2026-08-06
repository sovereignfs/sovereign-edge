import type { File } from 'expo-file-system';

import { ModelError, type ModelDescriptor } from './types';
import { sha256FileJs } from './hashing';
import { verifyFile } from './verify';

const ABC = new Uint8Array([0x61, 0x62, 0x63]); // "abc"
// Published digests for "abc" — fixed vectors, so these tests fail if the
// hashing wiring changes rather than merely agreeing with themselves.
const ABC_SHA256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const ABC_MD5 = '900150983cd24fb0d6963f7d28e17f72';

/** Minimal stand-in exposing only what verify.ts touches. */
function fakeFile(
  bytes: Uint8Array,
  overrides: { size?: number; md5?: string | null } = {},
): File {
  const streamed = jest.fn(() => {
    let sent = false;
    return {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        },
        releaseLock: () => {},
      }),
    };
  });

  return {
    info: () => ({
      size: overrides.size ?? bytes.byteLength,
      md5: overrides.md5 === undefined ? ABC_MD5 : overrides.md5,
    }),
    readableStream: streamed,
  } as unknown as File;
}

const descriptor: ModelDescriptor = {
  id: 'test-model',
  name: 'Test Model',
  url: 'https://example.invalid/test.gguf',
  sizeBytes: 3,
  md5: ABC_MD5,
  sha256: ABC_SHA256,
};

describe('sha256FileJs', () => {
  it('computes SHA-256 from the file stream', async () => {
    await expect(sha256FileJs(fakeFile(ABC))).resolves.toBe(ABC_SHA256);
  });

  it('reports incremental progress', async () => {
    const seen: number[] = [];
    await sha256FileJs(fakeFile(ABC), (n) => seen.push(n));
    expect(seen).toEqual([3]);
  });
});

describe('verifyFile', () => {
  it('accepts a file matching size and MD5', async () => {
    await expect(
      verifyFile(fakeFile(ABC), descriptor),
    ).resolves.toBeUndefined();
  });

  it('rejects a truncated file', async () => {
    await expect(
      verifyFile(fakeFile(ABC, { size: 2 }), descriptor),
    ).rejects.toMatchObject({ code: 'size-mismatch' });
  });

  it('rejects a file whose MD5 does not match', async () => {
    await expect(
      verifyFile(fakeFile(ABC, { md5: 'f'.repeat(32) }), descriptor),
    ).rejects.toMatchObject({ code: 'checksum-mismatch' });
  });

  it('fails clearly when the file cannot be read', async () => {
    await expect(
      verifyFile(fakeFile(ABC, { md5: null }), descriptor),
    ).rejects.toBeInstanceOf(ModelError);
  });

  it('does not hash unless deep verification is requested', async () => {
    // The whole point of the MD5 default: SHA-256 costs ~1 hour per 4 GB, so
    // the stream must not even be opened on the normal path.
    const file = fakeFile(ABC);
    await verifyFile(file, descriptor);
    expect(file.readableStream).not.toHaveBeenCalled();
  });

  it('checks SHA-256 when deep verification is requested', async () => {
    const file = fakeFile(ABC);
    await expect(
      verifyFile(file, descriptor, { deep: true }),
    ).resolves.toBeUndefined();
    expect(file.readableStream).toHaveBeenCalled();
  });

  it('rejects a SHA-256 mismatch under deep verification', async () => {
    const wrong = { ...descriptor, sha256: 'f'.repeat(64) };
    await expect(
      verifyFile(fakeFile(ABC), wrong, { deep: true }),
    ).rejects.toMatchObject({ code: 'checksum-mismatch' });
  });

  it('skips deep verification when the descriptor has no SHA-256', async () => {
    const noSha: ModelDescriptor = { ...descriptor, sha256: undefined };
    const file = fakeFile(ABC);
    await expect(
      verifyFile(file, noSha, { deep: true }),
    ).resolves.toBeUndefined();
    expect(file.readableStream).not.toHaveBeenCalled();
  });

  it('refuses to pass a file it could only check by size', async () => {
    // Catalog entries carry the publisher's SHA-256 but usually no MD5.
    // Accepting size alone would make "verified" mean almost nothing — any
    // file of the right length would pass.
    const shaOnly = { ...descriptor, md5: undefined };
    const file = fakeFile(ABC);

    await expect(verifyFile(file, shaOnly)).rejects.toMatchObject({
      code: 'verification-unavailable',
    });
    expect(file.readableStream).not.toHaveBeenCalled();
  });

  it('verifies a SHA-256-only descriptor when deep is requested', async () => {
    const shaOnly = { ...descriptor, md5: undefined };
    await expect(
      verifyFile(fakeFile(ABC), shaOnly, { deep: true }),
    ).resolves.toBeUndefined();
  });

  it('refuses a descriptor carrying no digest at all', async () => {
    const noDigest = { ...descriptor, md5: undefined, sha256: undefined };
    await expect(
      verifyFile(fakeFile(ABC), noDigest, { deep: true }),
    ).rejects.toMatchObject({ code: 'verification-unavailable' });
  });

  it('accepts uppercase digests in the descriptor', async () => {
    const upper = { ...descriptor, md5: ABC_MD5.toUpperCase() };
    await expect(verifyFile(fakeFile(ABC), upper)).resolves.toBeUndefined();
  });
});
