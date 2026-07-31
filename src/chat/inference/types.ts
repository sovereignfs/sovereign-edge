/**
 * Inference engine types (epic task 1.1).
 *
 * This layer is deliberately free of network types. Per
 * research 0001, nothing under `src/chat/` may open a socket — the model file
 * is already on disk by the time anything here runs, put there by
 * `src/models/`.
 */

/** A message in the conversation, in the shape the chat template expects. */
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LoadOptions = {
  /** Absolute path to a GGUF file already on disk. */
  modelPath: string;
  /** Context window in tokens. Larger costs memory; 2048 is a safe default. */
  contextSize?: number;
  /**
   * Try to use the GPU (Metal on iOS, OpenCL on Android). Falls back to CPU
   * silently when unavailable — check `EngineInfo.gpu` for what happened.
   */
  useGpu?: boolean;
  /** 0–1 load progress, useful for large models. */
  onProgress?: (fraction: number) => void;
};

export type GenerateOptions = {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Sequences that end generation early. */
  stop?: string[];
  /** Called for each token as it is produced. */
  onToken?: (token: string) => void;
  /** Aborts generation. Resolves with whatever was produced so far. */
  signal?: AbortSignal;
};

export type GenerateResult = {
  text: string;
  /** Why generation ended — useful for distinguishing truncation from EOS. */
  stopReason: 'eos' | 'length' | 'stop-sequence' | 'aborted';
  tokensGenerated: number;
  /**
   * Milliseconds until the first token appeared — the prompt-processing
   * (prefill) cost. Reported separately because it is what the user
   * experiences as lag, and because folding it into the rate below badly
   * distorts short replies. `null` if no token was produced.
   */
  timeToFirstTokenMs: number | null;
  /**
   * Tokens per second measured **from the first token onward**, so it
   * describes generation speed rather than prefill plus generation. On a
   * short reply the difference is roughly 6×.
   */
  tokensPerSecond: number | null;
};

/** What actually got loaded — reported after load, not assumed beforehand. */
export type EngineInfo = {
  /** Whether GPU acceleration is genuinely active. */
  gpu: boolean;
  /** Why the GPU was not used, when it was not. */
  reasonNoGpu: string | null;
  contextSize: number;
};

export type InferenceErrorCode =
  /** The GGUF file is missing, unreadable, or not a valid model. */
  | 'model-load-failed'
  /** Generation was attempted with no model loaded. */
  | 'no-model-loaded'
  /** The engine ran out of memory — the common failure on real devices. */
  | 'out-of-memory'
  /** Generation itself failed. */
  | 'generation-failed';

export class InferenceError extends Error {
  readonly code: InferenceErrorCode;

  constructor(
    code: InferenceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'InferenceError';
    this.code = code;
  }
}
