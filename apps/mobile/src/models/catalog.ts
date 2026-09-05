import type { ModelDescriptor } from './types';

/**
 * A curated model, as shown in the model manager.
 *
 * Sizes and SHA-256 digests are the publisher's own, read from the Hugging
 * Face API rather than measured locally — they are what the publisher
 * asserts, which is the point of verifying against them.
 */
export type CatalogEntry = ModelDescriptor & {
  /** Parameter count, for display: '0.5B', '1.5B'. */
  parameters: string;
  /**
   * The same count in billions, for comparison.
   *
   * Held separately rather than parsed out of `parameters`: that field is a
   * display string, and capability decisions should not hinge on its
   * formatting. Task 1.4 measured a real capability cliff between 0.5B and 1B
   * — Draft fabricated a price on the smaller model and not the larger.
   */
  parametersB: number;
  /** One line on what this model is good for. */
  summary: string;
  /**
   * What the model is *for* (epic task 16.1).
   *
   * Absent means `'chat'`, so every pre-existing entry keeps its meaning
   * without being touched. `'embedding'` entries produce vectors, not text:
   * they are infrastructure for the knowledge base (epic 16), never
   * something the user picks to talk to, and `ModelManager.list()` filters
   * them out of the model manager for exactly that reason. Reach them
   * through `listEmbeddingModels()` instead.
   */
  kind?: 'chat' | 'embedding';
};

/**
 * The Phase 1 catalog.
 *
 * Deliberately a spread rather than a single recommendation: the RAM guidance
 * in `fitForDevice()` only means something if there is a smaller option to
 * fall back to. All are instruction-tuned and Q4_K_M — a quantisation that
 * keeps quality reasonable at roughly half the size of Q8.
 *
 * The final list is still an open question (research 0001); this is a working
 * set, not a committed one.
 *
 * On digests: every entry carries only the publisher's SHA-256, and
 * deliberately no MD5.
 *
 * This entry used to carry one, from the era when `expo-file-system`'s native
 * MD5 was the only fast digest available. Measured on an iPhone 15 Pro, the
 * native SHA-256 module (task 0.5) hashes at ~2.2 GB/s — roughly 4x faster
 * than the native MD5 it was chosen over — so the MD5 bought nothing and cost
 * a second full pass over the file: verifying this 491 MB model took 960ms
 * with both digests against 223ms for SHA-256 alone. It was also the weaker
 * claim, being maintainer-computed rather than publisher-published.
 */
export const CURATED_MODELS: CatalogEntry[] = [
  {
    id: 'qwen2.5-0.5b-instruct-q4km',
    name: 'Qwen2.5 0.5B Instruct',
    parameters: '0.5B',
    parametersB: 0.5,
    quantization: 'Q4_K_M',
    summary: 'Smallest option. Runs on almost anything; answers stay short.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    sizeBytes: 491_400_032,
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
  },
  {
    id: 'llama-3.2-1b-instruct-q4km',
    name: 'Llama 3.2 1B Instruct',
    parameters: '1B',
    parametersB: 1,
    quantization: 'Q4_K_M',
    summary:
      'A step up in coherence while staying comfortable on mid-range phones.',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sizeBytes: 807_694_464,
    sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
  },
  {
    id: 'qwen2.5-1.5b-instruct-q4km',
    name: 'Qwen2.5 1.5B Instruct',
    parameters: '1.5B',
    parametersB: 1.5,
    quantization: 'Q4_K_M',
    summary:
      'Noticeably better at following instructions. Wants a recent phone.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeBytes: 1_117_320_736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
  },
  {
    id: 'gemma-2-2b-it-q4km',
    name: 'Gemma 2 2B Instruct',
    parameters: '2B',
    parametersB: 2,
    quantization: 'Q4_K_M',
    summary: 'Best quality here, and the heaviest. High-end devices only.',
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    sizeBytes: 1_708_582_752,
    sha256: 'e0aee85060f168f0f2d8473d7ea41ce2f3230c1bc1374847505ea599288a7787',
  },
  // A different shape of model from the four above: tuned specifically to
  // answer only from text handed to it in the prompt, not as a general
  // chat model. Whether its chat template declares tool-calling support —
  // `EngineInfo.toolCapable`, read from `chatTemplates.jinja.defaultCaps.tools`
  // in `chat/inference/engine.ts` — was flagged as unverified before this was
  // added; if it comes back `false` on-device, this model simply won't be
  // offered a connector, the same honest "unsupported" path any tool-incapable
  // model already takes. Licensed under LFM Open License v1.0, not fully
  // permissive: free for commercial use under $10M annual revenue.
  {
    id: 'lfm2-1.2b-rag-q4km',
    name: 'LFM2 1.2B RAG',
    parameters: '1.2B',
    parametersB: 1.2,
    quantization: 'Q4_K_M',
    summary: 'Answers only from text you give it — not a general chat model.',
    url: 'https://huggingface.co/LiquidAI/LFM2-1.2B-RAG-GGUF/resolve/main/LFM2-1.2B-RAG-Q4_K_M.gguf',
    sizeBytes: 730_894_048,
    sha256: '5e4d123cd76dd38a1b55f86a5e1f5fa579e452ff89fa636709edbecd3513db0a',
  },
  {
    id: 'qwen3-4b-instruct-2507-q4km',
    name: 'Qwen3 4B Instruct',
    parameters: '4B',
    parametersB: 4,
    quantization: 'Q4_K_M',
    summary: 'Best quality here, and Apache-licensed. Wants a flagship phone.',
    url: 'https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    sizeBytes: 2_497_280_736,
    sha256: '2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e',
  },
  // Google's own official QAT release, not a community requant — the most
  // trustworthy source for a model this new. "E4B" names the model's
  // "effective 4B" elastic-inference footprint (Gemma's MatFormer
  // architecture can run a nested, cheaper sub-model), but that name
  // describes compute, not what has to be downloaded and mapped into
  // memory: this is a real 8B-parameter checkpoint, quantized to 5.15 GB —
  // by far the heaviest entry here, more than double Qwen3 4B above.
  // `parametersB` is deliberately set to 8, not 4: `fitForDevice()` in
  // `models/device.ts` sizes its RAM estimate off `sizeBytes` (already
  // correct either way), but `parametersB` is also what Draft mode's
  // `cautionBelowB` warning and any future capability comparison would
  // read, and both should see the number that matches what is actually
  // resident in memory, not the marketing figure.
  {
    id: 'gemma-4-e4b-it-q4-0',
    name: 'Gemma 4 E4B Instruct',
    parameters: '8B (4B effective)',
    parametersB: 8,
    quantization: 'Q4_0',
    summary:
      'The heaviest option by far — a large download. Flagship devices only.',
    url: 'https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf/resolve/main/gemma-4-E4B_q4_0-it.gguf',
    sizeBytes: 5_154_941_280,
    sha256: '676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee',
  },

  // ---------------------------------------------------------------------
  // Embedding models (epic 16, task 16.1).
  //
  // Not chat models. `ModelManager.list()` filters these out, so they never
  // appear in the model manager; they exist to be fetched and measured, and
  // later to back the knowledge base's index.
  //
  // Both entries below are the **spike set**, not a committed choice. Task
  // 16.1 measures them on a real device — peak memory with one of these
  // resident *alongside* a chat model is the number that decides whether
  // epic 16 is viable in its current shape at all — and the loser is
  // deleted when it concludes. See research 0012.
  //
  // Both are F16/Q8 rather than Q4_K_M, which is a deliberate break from
  // every chat entry above. Quantisation noise costs an embedding model
  // more than it costs a generator: a chat model quantised too hard writes
  // slightly worse prose, while an embedding model quantised too hard
  // returns subtly wrong neighbours, which is invisible at the point of
  // failure and corrupts retrieval quality everywhere downstream. These
  // models are small enough that the higher precision is affordable —
  // bge-small at F16 is still only 67 MB.
  {
    id: 'bge-small-en-v1.5-f16',
    name: 'BGE Small EN v1.5',
    parameters: '33M',
    parametersB: 0.033,
    quantization: 'F16',
    kind: 'embedding',
    summary: 'Smallest embedding option — 384-dim vectors, English only.',
    // Third-party conversion: BAAI publishes the model, not this GGUF. A
    // weaker provenance claim than the entry below, where the model's own
    // author publishes the GGUF, and part of what 16.1 is weighing.
    url: 'https://huggingface.co/ChristianAzinn/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5_fp16.gguf',
    sizeBytes: 67_308_128,
    sha256: 'f0b2fef971e8366438bfd2d9aefea1b0115919389448806d290237f638bae999',
  },
  {
    id: 'nomic-embed-text-v1.5-q8',
    name: 'Nomic Embed Text v1.5',
    parameters: '137M',
    parametersB: 0.137,
    quantization: 'Q8_0',
    kind: 'embedding',
    summary: 'Longer context and stronger retrieval — 768-dim vectors.',
    // First-party GGUF, published by the model's own author, and Apache-2.0.
    // Its 8192-token input window is the substantive advantage over
    // bge-small's 512: it leaves chunk size a design choice in task 16.4
    // rather than a constraint imposed by the embedder.
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q8_0.gguf',
    sizeBytes: 146_146_432,
    sha256: '3e24342164b3d94991ba9692fdc0dd08e3fd7362e0aacc396a9a5c54a544c3b7',
  },
];

/**
 * The embedding models, for the knowledge base (epic 16).
 *
 * Kept separate from `CURATED_MODELS` at the point of use rather than in a
 * second array: one catalog means one place where an id, URL, size, and
 * digest live, and `findInCatalog` keeps working for both kinds — the model
 * store and its verification path do not care what a model is for.
 */
export function listEmbeddingModels(): CatalogEntry[] {
  return CURATED_MODELS.filter((entry) => entry.kind === 'embedding');
}

/** The chat models — everything the model manager should actually offer. */
export function listChatModels(): CatalogEntry[] {
  return CURATED_MODELS.filter((entry) => entry.kind !== 'embedding');
}

export function findInCatalog(id: string): CatalogEntry | undefined {
  return CURATED_MODELS.find((entry) => entry.id === id);
}
