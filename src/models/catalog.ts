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
  /** One line on what this model is good for. */
  summary: string;
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
 * On digests: publishers publish SHA-256, so that is what every entry carries.
 * `md5` is present only where a maintainer has downloaded the file and
 * computed it, because `expo-file-system` hashes MD5 natively and SHA-256
 * only in JS — see research 0003, and the note in `verify.ts` about why an
 * entry without `md5` cannot be verified quickly today.
 */
export const CURATED_MODELS: CatalogEntry[] = [
  {
    id: 'qwen2.5-0.5b-instruct-q4km',
    name: 'Qwen2.5 0.5B Instruct',
    parameters: '0.5B',
    quantization: 'Q4_K_M',
    summary: 'Smallest option. Runs on almost anything; answers stay short.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    sizeBytes: 491_400_032,
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
    md5: 'a24e22d4ea0d9a6b3efd57936ecb127b',
  },
  {
    id: 'llama-3.2-1b-instruct-q4km',
    name: 'Llama 3.2 1B Instruct',
    parameters: '1B',
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
    quantization: 'Q4_K_M',
    summary: 'Best quality here, and the heaviest. High-end devices only.',
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
    sizeBytes: 1_708_582_752,
    sha256: 'e0aee85060f168f0f2d8473d7ea41ce2f3230c1bc1374847505ea599288a7787',
  },
];

export function findInCatalog(id: string): CatalogEntry | undefined {
  return CURATED_MODELS.find((entry) => entry.id === id);
}
