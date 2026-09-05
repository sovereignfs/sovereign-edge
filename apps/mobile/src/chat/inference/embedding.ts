import { initLlama, type LlamaContext } from 'llama.rn';

import {
  DEFAULT_EMBEDDING_CONTEXT_SIZE,
  EMBEDDING_POOLING_TYPE,
  InferenceError,
  type EmbeddingEngineInfo,
  type EmbeddingResult,
  type LoadEmbeddingOptions,
} from './types';

/**
 * Wrapper around `llama.rn`'s embedding support (epic task 16.1).
 *
 * Separate from `InferenceEngine` rather than a method on it, and that
 * separation is the whole point:
 *
 *  - **An embedding model needs its own context.** `llama.rn` takes
 *    `embedding: true` and a `pooling_type` at context creation, and the Rust
 *    side says the same thing from the other direction with
 *    `EmbeddingsError::{NotEnabled, NonePoolType}`. One context cannot serve
 *    both chat and embeddings, so this is not an option to design around.
 *  - **`InferenceEngine` enforces "one context at a time"**, releasing any
 *    existing context on `load()` because "holding two sets of weights
 *    briefly is enough to be killed on a mid-range device." That invariant is
 *    correct and stays. Putting embeddings on a second class makes the
 *    exception explicit and auditable instead of quietly weakening the rule
 *    that protects the chat path.
 *
 * **This class is therefore the one place two models can be resident at
 * once, and that is a real risk, not a theoretical one.** Whether it is
 * survivable on a mid-range Android device is exactly what task 16.1 has to
 * measure, and the answer is not yet known — see
 * [research 0012](../../../../../docs/research/0012-knowledge-base-and-retrieval.md).
 * Until it is, callers should prefer loading, embedding a batch, and
 * unloading (epic task 16.4's batch indexing) over holding this open for a
 * whole session.
 *
 * Nothing here touches the network, same as `engine.ts`: the model file is
 * already on disk, put there by `src/models/`.
 */
export class EmbeddingEngine {
  private context: LlamaContext | null = null;
  private info: EmbeddingEngineInfo | null = null;

  get isLoaded(): boolean {
    return this.context !== null;
  }

  get engineInfo(): EmbeddingEngineInfo | null {
    return this.info;
  }

  async load(options: LoadEmbeddingOptions): Promise<EmbeddingEngineInfo> {
    const {
      modelPath,
      contextSize = DEFAULT_EMBEDDING_CONTEXT_SIZE,
      useGpu = false,
    } = options;

    await this.unload();

    let context: LlamaContext;
    try {
      context = await initLlama({
        model: modelPath,
        n_ctx: contextSize,
        n_gpu_layers: useGpu ? 99 : 0,
        embedding: true,
        pooling_type: EMBEDDING_POOLING_TYPE,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      // Same recovery as `engine.ts`: the native side reports OOM through the
      // same channel as a corrupt file, and the distinction is the difference
      // between "this device cannot hold both models" — the finding task 16.1
      // exists to produce — and "this download is broken".
      const code = /memory|alloc|oom/i.test(message)
        ? 'out-of-memory'
        : 'model-load-failed';
      throw new InferenceError(
        code,
        `Could not load the embedding model at ${modelPath}: ${message}`,
        { cause },
      );
    }

    this.context = context;
    this.info = {
      gpu: context.gpu,
      contextSize,
      // Read from the loaded model, never inferred from its name: this is the
      // number every persisted vector's length has to match, and a silent
      // change to it invalidates an entire index.
      dimensions: context.model?.nEmbd ?? 0,
    };
    return this.info;
  }

  /** Embeds one string. */
  async embed(text: string): Promise<EmbeddingResult> {
    const context = this.context;
    if (!context) {
      throw new InferenceError(
        'embedding-failed',
        'An embedding was requested before an embedding model was loaded.',
      );
    }

    const startedAt = Date.now();
    try {
      const result = await context.embedding(text);
      const vector = result.embedding ?? [];
      if (vector.length === 0) {
        // An empty vector is not a usable "empty result" — it would poison a
        // cosine search with a zero-magnitude entry rather than simply
        // ranking last. Fail loudly instead.
        throw new InferenceError(
          'embedding-failed',
          'The embedding model returned an empty vector.',
        );
      }
      return { vector, elapsedMs: Date.now() - startedAt };
    } catch (cause) {
      if (cause instanceof InferenceError) throw cause;
      throw new InferenceError(
        'embedding-failed',
        `Embedding failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }

  /**
   * Embeds several strings in sequence.
   *
   * Sequential rather than concurrent on purpose: these all run on one native
   * context, so firing them together buys no parallelism and only deepens the
   * peak memory this class already has to justify.
   */
  async embedAll(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  /** Releases the embedding model and its memory. */
  async unload(): Promise<void> {
    const context = this.context;
    if (!context) return;

    this.context = null;
    this.info = null;
    await context.release();
  }
}
