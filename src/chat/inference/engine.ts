import { initLlama, type LlamaContext } from 'llama.rn';

import {
  InferenceError,
  type EngineInfo,
  type GenerateOptions,
  type GenerateResult,
  type LoadOptions,
} from './types';

/**
 * Wrapper around `llama.rn`, exposing load / generate / unload.
 *
 * The wrapper exists so the chat UI and the connector framework never touch
 * `llama.rn` directly. That keeps the engine swappable — the concrete binding
 * is a decision recorded in research 0001, not a permanent commitment — and
 * gives one place to enforce the invariants below.
 *
 * Two invariants worth stating, because both are easy to violate by accident:
 *
 *  - **One context at a time.** Each loaded model holds its weights in memory;
 *    a second concurrent context is the fastest route to an OOM kill on a
 *    phone. `load()` releases any existing context first.
 *  - **Nothing here touches the network.** The model path points at a file
 *    `src/models/` already placed on disk.
 */
export class InferenceEngine {
  private context: LlamaContext | null = null;
  private info: EngineInfo | null = null;
  private generating = false;

  get isLoaded(): boolean {
    return this.context !== null;
  }

  /** What actually loaded, or `null` when no model is loaded. */
  get engineInfo(): EngineInfo | null {
    return this.info;
  }

  async load(options: LoadOptions): Promise<EngineInfo> {
    const {
      modelPath,
      contextSize = 2048,
      useGpu = true,
      onProgress,
    } = options;

    // Releasing first is not merely tidy: holding two sets of weights briefly
    // is enough to be killed on a mid-range device.
    await this.unload();

    let context: LlamaContext;
    try {
      context = await initLlama(
        {
          model: modelPath,
          n_ctx: contextSize,
          n_gpu_layers: useGpu ? 99 : 0,
        },
        onProgress ? (percent) => onProgress(percent / 100) : undefined,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      // The engine reports memory exhaustion through the same channel as any
      // other load failure, so the distinction has to be recovered here —
      // it is the difference between "try a smaller quantisation" and
      // "this file is broken".
      const code = /memory|alloc|oom/i.test(message)
        ? 'out-of-memory'
        : 'model-load-failed';
      throw new InferenceError(
        code,
        `Could not load the model at ${modelPath}: ${message}`,
        { cause },
      );
    }

    this.context = context;
    this.info = {
      gpu: context.gpu,
      reasonNoGpu: context.gpu ? null : context.reasonNoGPU || 'unknown',
      contextSize,
    };
    return this.info;
  }

  /**
   * Streams a completion. `onToken` fires per token; the resolved result
   * carries the full text and timing.
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const context = this.context;
    if (!context) {
      throw new InferenceError(
        'no-model-loaded',
        'Generation was requested before a model was loaded.',
      );
    }
    if (this.generating) {
      throw new InferenceError(
        'generation-failed',
        'A generation is already in progress on this context.',
      );
    }

    const {
      messages,
      maxTokens = 512,
      temperature = 0.7,
      stop = [],
      onToken,
      signal,
    } = options;

    this.generating = true;
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      void context.stopCompletion();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const startedAt = Date.now();
    let firstTokenAt: number | null = null;

    try {
      const result = await context.completion(
        {
          messages,
          n_predict: maxTokens,
          temperature,
          stop,
        },
        (data) => {
          firstTokenAt ??= Date.now();
          onToken?.(data.token);
        },
      );

      const finishedAt = Date.now();
      const tokensGenerated = result.tokens_predicted ?? 0;

      // Measured from the first token, not from the call. Prompt processing
      // dominates a short reply — on a 10-token answer, including it reported
      // 7.5 tok/s for generation that actually ran at ~43.
      const generationSeconds =
        firstTokenAt === null ? 0 : (finishedAt - firstTokenAt) / 1000;

      return {
        text: result.text ?? '',
        stopReason: aborted
          ? 'aborted'
          : result.stopped_eos
            ? 'eos'
            : result.stopped_word
              ? 'stop-sequence'
              : 'length',
        tokensGenerated,
        timeToFirstTokenMs:
          firstTokenAt === null ? null : firstTokenAt - startedAt,
        tokensPerSecond:
          generationSeconds > 0 && tokensGenerated > 0
            ? tokensGenerated / generationSeconds
            : null,
      };
    } catch (cause) {
      if (aborted) {
        // An abort surfaces as a rejection from the native side; it is a
        // deliberate outcome, not a failure.
        return {
          text: '',
          stopReason: 'aborted',
          tokensGenerated: 0,
          timeToFirstTokenMs:
            firstTokenAt === null ? null : firstTokenAt - startedAt,
          tokensPerSecond: null,
        };
      }
      throw new InferenceError(
        'generation-failed',
        `Generation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    } finally {
      this.generating = false;
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Releases the model and its memory. Safe to call when nothing is loaded. */
  async unload(): Promise<void> {
    const context = this.context;
    if (!context) return;

    this.context = null;
    this.info = null;
    this.generating = false;
    await context.release();
  }
}
