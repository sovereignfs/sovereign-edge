/**
 * Wrapper behaviour, not llama.rn's — same posture as `engine.test.ts`.
 * `initLlama` is mocked so the paths that matter can be exercised
 * deterministically: the context params an embedding model actually requires,
 * an out-of-memory load, and a degenerate empty vector.
 *
 * What this file explicitly does **not** establish is whether an embedding
 * context can coexist with a loaded chat model on a real device. That is task
 * 16.1's measurement, it needs real hardware, and no amount of mocking here
 * speaks to it.
 *
 * Names are `mock`-prefixed because Jest hoists `jest.mock()` factories above
 * the surrounding declarations.
 */
import { EmbeddingEngine } from './embedding';
import { InferenceError } from './types';

const mockRelease = jest.fn(async () => {});
const mockEmbedding = jest.fn();

const mockContext = {
  gpu: false,
  model: { nEmbd: 384 },
  release: mockRelease,
  embedding: mockEmbedding,
};

const mockInitLlama = jest.fn(async () => mockContext);

jest.mock('llama.rn', () => ({
  initLlama: (...args: unknown[]) => mockInitLlama(...(args as [])),
}));

describe('EmbeddingEngine', () => {
  let engine: EmbeddingEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext.gpu = false;
    mockContext.model = { nEmbd: 384 };
    mockInitLlama.mockImplementation(async () => mockContext);
    mockEmbedding.mockImplementation(async () => ({ embedding: [0.1, 0.2] }));
    engine = new EmbeddingEngine();
  });

  describe('load', () => {
    it('creates the context with embeddings enabled and mean pooling', async () => {
      await engine.load({ modelPath: '/models/bge.gguf' });

      // The two params that make this an embedding context at all. Without
      // them llama.cpp reports NotEnabled/NonePoolType rather than returning
      // a usable vector, so they are the load's actual contract.
      expect(mockInitLlama).toHaveBeenCalledWith(
        expect.objectContaining({
          model: '/models/bge.gguf',
          embedding: true,
          pooling_type: 'mean',
        }),
      );
    });

    it('defaults to CPU so it does not contend with the chat model for GPU memory', async () => {
      await engine.load({ modelPath: '/models/bge.gguf' });

      expect(mockInitLlama).toHaveBeenCalledWith(
        expect.objectContaining({ n_gpu_layers: 0 }),
      );
    });

    it('reports the dimension read from the loaded model', async () => {
      mockContext.model = { nEmbd: 768 };

      const info = await engine.load({ modelPath: '/models/nomic.gguf' });

      expect(info.dimensions).toBe(768);
      expect(engine.isLoaded).toBe(true);
    });

    it('surfaces an out-of-memory load distinctly from a broken file', async () => {
      mockInitLlama.mockImplementation(async () => {
        throw new Error('failed to allocate memory for model');
      });

      await expect(
        engine.load({ modelPath: '/models/bge.gguf' }),
      ).rejects.toMatchObject({ code: 'out-of-memory' });
    });

    it('reports a non-memory failure as a load failure', async () => {
      mockInitLlama.mockImplementation(async () => {
        throw new Error('unknown model architecture');
      });

      await expect(
        engine.load({ modelPath: '/models/bge.gguf' }),
      ).rejects.toMatchObject({ code: 'model-load-failed' });
    });

    it('releases an existing context before loading another', async () => {
      await engine.load({ modelPath: '/models/bge.gguf' });
      await engine.load({ modelPath: '/models/nomic.gguf' });

      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('embed', () => {
    it('returns the vector', async () => {
      await engine.load({ modelPath: '/models/bge.gguf' });

      const result = await engine.embed('hello');

      expect(result.vector).toEqual([0.1, 0.2]);
      expect(mockEmbedding).toHaveBeenCalledWith('hello');
    });

    it('fails when no model is loaded', async () => {
      await expect(engine.embed('hello')).rejects.toBeInstanceOf(
        InferenceError,
      );
      await expect(engine.embed('hello')).rejects.toMatchObject({
        code: 'embedding-failed',
      });
    });

    it('rejects an empty vector rather than returning one', async () => {
      // A zero-length vector would sit in the index with no magnitude and
      // poison cosine similarity, instead of simply ranking last — so it has
      // to fail at the point it is produced, not at the point it is searched.
      mockEmbedding.mockImplementation(async () => ({ embedding: [] }));
      await engine.load({ modelPath: '/models/bge.gguf' });

      await expect(engine.embed('hello')).rejects.toMatchObject({
        code: 'embedding-failed',
      });
    });

    it('wraps a native embedding failure', async () => {
      mockEmbedding.mockImplementation(async () => {
        throw new Error('native boom');
      });
      await engine.load({ modelPath: '/models/bge.gguf' });

      await expect(engine.embed('hello')).rejects.toMatchObject({
        code: 'embedding-failed',
      });
    });
  });

  describe('embedAll', () => {
    it('embeds sequentially and preserves input order', async () => {
      let inFlight = 0;
      mockEmbedding.mockImplementation(async (text: string) => {
        inFlight += 1;
        // One native context: overlapping calls would deepen peak memory for
        // no parallelism, so the implementation must not fan out.
        expect(inFlight).toBe(1);
        await Promise.resolve();
        inFlight -= 1;
        return { embedding: [text.length] };
      });
      await engine.load({ modelPath: '/models/bge.gguf' });

      const results = await engine.embedAll(['a', 'bbb', 'cc']);

      expect(results.map((r) => r.vector[0])).toEqual([1, 3, 2]);
    });
  });

  describe('unload', () => {
    it('releases the context and is safe to call twice', async () => {
      await engine.load({ modelPath: '/models/bge.gguf' });

      await engine.unload();
      await engine.unload();

      expect(mockRelease).toHaveBeenCalledTimes(1);
      expect(engine.isLoaded).toBe(false);
      expect(engine.engineInfo).toBeNull();
    });
  });
});
