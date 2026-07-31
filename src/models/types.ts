/**
 * Model asset pipeline — types (epic task 0.4).
 *
 * Weights are never bundled into the app binary; they are fetched at runtime
 * to a user-visible, user-deletable location.
 */

/** A downloadable GGUF model. Catalog entries are plain data, no code. */
export type ModelDescriptor = {
  /** Stable identifier, also the on-disk filename stem. */
  id: string;
  /** Human-readable name shown in the model manager. */
  name: string;
  /** Direct download URL for the `.gguf` file. */
  url: string;
  /** Exact expected size. Checked before hashing — a cheap truncation check. */
  sizeBytes: number;
  /**
   * Lowercase hex MD5 of the complete file. Always verified: it is the only
   * digest `expo-file-system` computes natively, and so the only one fast
   * enough to run on every download. See the rationale in `verify.ts`.
   */
  md5: string;
  /**
   * Lowercase hex SHA-256, when the publisher provides one. Only checked
   * under `deep` verification — hashing it in JS costs about an hour per
   * 4 GB until a native implementation lands.
   */
  sha256?: string;
  /** e.g. `Q4_K_M`. Display only. */
  quantization?: string;
};

/** A model present on disk, as reported by the store. */
export type InstalledModel = {
  id: string;
  uri: string;
  sizeBytes: number;
  /** Whether the on-disk size matches the descriptor, when one is known. */
  complete: boolean;
};

export type DownloadProgress = {
  bytesWritten: number;
  /** `null` when the server sends no Content-Length. */
  totalBytes: number | null;
  /** 0–1, or `null` when the total is unknown. */
  fraction: number | null;
};

export type DownloadPhase =
  'idle' | 'downloading' | 'paused' | 'verifying' | 'done' | 'failed';

/**
 * Why a download ended badly. Every failure path produces one of these — the
 * point of the epic's "never a silent stuck state" requirement is that a
 * caller can always tell the user something specific.
 */
export type ModelErrorCode =
  /** No progress for longer than the stall timeout. */
  | 'stalled'
  /** Transport failed (offline, DNS, TLS, non-2xx). */
  | 'network'
  /** Downloaded byte count does not match the descriptor. */
  | 'size-mismatch'
  /** SHA-256 does not match the descriptor. */
  | 'checksum-mismatch'
  /** Not enough free space to hold the model. */
  | 'insufficient-space'
  /** Caller cancelled deliberately. */
  | 'cancelled'
  /** Filesystem refused a read or write. */
  | 'storage';

export class ModelError extends Error {
  readonly code: ModelErrorCode;
  readonly modelId: string;

  constructor(
    code: ModelErrorCode,
    modelId: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ModelError';
    this.code = code;
    this.modelId = modelId;
  }
}
