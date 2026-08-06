/**
 * Verification when native SHA-256 is present.
 *
 * The other verify tests run with the native module absent — which is what
 * Jest sees, since `requireNativeModule` cannot resolve outside a real build.
 * That is a useful default, but it means the path that matters in production
 * would otherwise go untested, so `./hashing` is mocked here to simulate a
 * device build.
 */
import type { File } from 'expo-file-system';

import type { ModelDescriptor } from './types';
import { assertVerifiable, verifyFile } from './verify';

const ABC_SHA256 =
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

const mockNativeAvailable = jest.fn(() => true);
const mockSha256File = jest.fn(async () => ABC_SHA256);
const mockSha256FileJs = jest.fn(async () => ABC_SHA256);

jest.mock('./hashing', () => ({
  isNativeHashingAvailable: () => mockNativeAvailable(),
  sha256File: (...args: unknown[]) => mockSha256File(...(args as [])),
  sha256FileJs: (...args: unknown[]) => mockSha256FileJs(...(args as [])),
}));

function fakeFile(size = 3): File {
  return {
    uri: 'file:///models/test.gguf',
    info: () => ({ size, md5: undefined }),
    readableStream: jest.fn(),
  } as unknown as File;
}

const shaOnly: ModelDescriptor = {
  id: 'sha-only',
  name: 'SHA-only Model',
  url: 'https://example.invalid/m.gguf',
  sizeBytes: 3,
  sha256: ABC_SHA256,
};

describe('verification with native SHA-256 available', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNativeAvailable.mockReturnValue(true);
    mockSha256File.mockResolvedValue(ABC_SHA256);
  });

  it('accepts a SHA-256-only model without opting into the slow path', () => {
    // This is the whole point of epic task 0.5: publishers publish SHA-256,
    // so the common catalog entry must verify by default rather than needing
    // a caller to accept an hour of JS hashing.
    expect(() => assertVerifiable(shaOnly, false)).not.toThrow();
  });

  it('verifies against the publisher digest by default', async () => {
    await expect(verifyFile(fakeFile(), shaOnly)).resolves.toBeUndefined();
    expect(mockSha256File).toHaveBeenCalled();
  });

  it('rejects a file whose SHA-256 does not match', async () => {
    mockSha256File.mockResolvedValue('f'.repeat(64));
    await expect(verifyFile(fakeFile(), shaOnly)).rejects.toMatchObject({
      code: 'checksum-mismatch',
    });
  });

  it('still checks size first, before hashing anything', async () => {
    await expect(verifyFile(fakeFile(999), shaOnly)).rejects.toMatchObject({
      code: 'size-mismatch',
    });
    expect(mockSha256File).not.toHaveBeenCalled();
  });

  it('refuses a SHA-256-only model when native hashing is missing', () => {
    mockNativeAvailable.mockReturnValue(false);
    expect(() => assertVerifiable(shaOnly, false)).toThrow();
    // …unless the caller accepts the slow JavaScript path.
    expect(() => assertVerifiable(shaOnly, true)).not.toThrow();
  });
});
