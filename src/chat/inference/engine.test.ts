/**
 * Wrapper behaviour, not llama.rn's. `initLlama` is mocked so the error paths
 * that matter on a real device — a failed load, an out-of-memory kill, an
 * aborted generation — can be exercised deterministically. Whether inference
 * genuinely works is settled on-device, not here.
 *
 * Names are `mock`-prefixed because Jest hoists `jest.mock()` factories above
 * the surrounding declarations.
 */
import { InferenceEngine } from './engine';
import { InferenceError, type ChatMessage } from './types';

const mockRelease = jest.fn(async () => {});
const mockStopCompletion = jest.fn(async () => {});
const mockCompletion = jest.fn();

const mockContext = {
  gpu: true,
  reasonNoGPU: '',
  release: mockRelease,
  stopCompletion: mockStopCompletion,
  completion: mockCompletion,
};

const mockInitLlama = jest.fn(async () => mockContext);

jest.mock('llama.rn', () => ({
  initLlama: (...args: unknown[]) => mockInitLlama(...(args as [])),
}));

const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

describe('InferenceEngine', () => {
  let engine: InferenceEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext.gpu = true;
    mockContext.reasonNoGPU = '';
    mockInitLlama.mockImplementation(async () => mockContext);
    mockCompletion.mockImplementation(async () => ({
      text: 'hi there',
      tokens_predicted: 2,
      stopped_eos: true,
    }));
    engine = new InferenceEngine();
  });

  describe('load', () => {
    it('reports whether the GPU is actually in use', async () => {
      const info = await engine.load({ modelPath: '/models/m.gguf' });
      expect(info).toEqual({
        gpu: true,
        reasonNoGpu: null,
        contextSize: 2048,
      });
      expect(engine.isLoaded).toBe(true);
    });

    it('surfaces why the GPU was declined rather than silently using CPU', async () => {
      mockContext.gpu = false;
      mockContext.reasonNoGPU = 'no OpenCL driver';
      const info = await engine.load({ modelPath: '/models/m.gguf' });
      expect(info.gpu).toBe(false);
      expect(info.reasonNoGpu).toBe('no OpenCL driver');
    });

    it('releases an existing context before loading another', async () => {
      // Holding two sets of weights at once is enough to be OOM-killed on a
      // mid-range phone, so this ordering is a memory-safety property.
      await engine.load({ modelPath: '/models/a.gguf' });
      await engine.load({ modelPath: '/models/b.gguf' });
      expect(mockRelease).toHaveBeenCalledTimes(1);
      expect(mockInitLlama).toHaveBeenCalledTimes(2);
    });

    it('distinguishes out-of-memory from a bad model file', async () => {
      mockInitLlama.mockImplementation(async () => {
        throw new Error('failed to allocate memory for model');
      });
      await expect(
        engine.load({ modelPath: '/models/big.gguf' }),
      ).rejects.toMatchObject({ code: 'out-of-memory' });
    });

    it('reports an unreadable model as a load failure', async () => {
      mockInitLlama.mockImplementation(async () => {
        throw new Error('unable to parse GGUF header');
      });
      await expect(
        engine.load({ modelPath: '/models/broken.gguf' }),
      ).rejects.toMatchObject({ code: 'model-load-failed' });
    });

    it('converts progress from percent to a 0-1 fraction', async () => {
      const seen: number[] = [];
      mockInitLlama.mockImplementation(async (...args: unknown[]) => {
        const onProgress = args[1] as ((p: number) => void) | undefined;
        onProgress?.(50);
        return mockContext;
      });
      await engine.load({
        modelPath: '/models/m.gguf',
        onProgress: (f) => seen.push(f),
      });
      expect(seen).toEqual([0.5]);
    });
  });

  describe('generate', () => {
    it('refuses to generate before a model is loaded', async () => {
      await expect(engine.generate({ messages })).rejects.toMatchObject({
        code: 'no-model-loaded',
      });
    });

    it('streams tokens through onToken', async () => {
      mockCompletion.mockImplementation(
        async (_params: unknown, cb: (d: { token: string }) => void) => {
          cb({ token: 'hi' });
          cb({ token: ' there' });
          return { text: 'hi there', tokens_predicted: 2, stopped_eos: true };
        },
      );
      await engine.load({ modelPath: '/models/m.gguf' });

      const tokens: string[] = [];
      const result = await engine.generate({
        messages,
        onToken: (t) => tokens.push(t),
      });

      expect(tokens).toEqual(['hi', ' there']);
      expect(result.text).toBe('hi there');
      expect(result.stopReason).toBe('eos');
    });

    it('distinguishes hitting the token limit from a natural stop', async () => {
      mockCompletion.mockImplementation(async () => ({
        text: 'truncated',
        tokens_predicted: 512,
        stopped_eos: false,
        stopped_word: false,
      }));
      await engine.load({ modelPath: '/models/m.gguf' });
      const result = await engine.generate({ messages });
      expect(result.stopReason).toBe('length');
    });

    it('reports a stop sequence as its own outcome', async () => {
      mockCompletion.mockImplementation(async () => ({
        text: 'up to here',
        tokens_predicted: 4,
        stopped_eos: false,
        stopped_word: true,
      }));
      await engine.load({ modelPath: '/models/m.gguf' });
      const result = await engine.generate({ messages, stop: ['\n\n'] });
      expect(result.stopReason).toBe('stop-sequence');
    });

    it('stops the native completion when aborted', async () => {
      const controller = new AbortController();
      mockCompletion.mockImplementation(
        async (_params: unknown, cb: (d: { token: string }) => void) => {
          cb({ token: 'partial' });
          controller.abort();
          throw new Error('completion interrupted');
        },
      );
      await engine.load({ modelPath: '/models/m.gguf' });

      const result = await engine.generate({
        messages,
        signal: controller.signal,
      });

      expect(mockStopCompletion).toHaveBeenCalled();
      expect(result.stopReason).toBe('aborted');
    });

    it('rejects a second concurrent generation on the same context', async () => {
      let finish: (() => void) | undefined;
      mockCompletion.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = () =>
              resolve({ text: '', tokens_predicted: 0, stopped_eos: true });
          }),
      );
      await engine.load({ modelPath: '/models/m.gguf' });

      const first = engine.generate({ messages });
      await expect(engine.generate({ messages })).rejects.toBeInstanceOf(
        InferenceError,
      );

      finish?.();
      await first;
    });

    it('measures generation rate from the first token, not from the call', async () => {
      // On-device, a 10-token reply spent 1123ms on prompt processing and
      // ~230ms generating. Dividing by total elapsed reported 7.5 tok/s for
      // generation that actually ran at ~43, so prefill is excluded here.
      jest.useFakeTimers();
      mockCompletion.mockImplementation(
        async (_params: unknown, cb: (d: { token: string }) => void) => {
          jest.advanceTimersByTime(3000); // prompt processing
          cb({ token: 'a' });
          jest.advanceTimersByTime(1000); // generation
          return { text: 'a', tokens_predicted: 4, stopped_eos: true };
        },
      );

      await engine.load({ modelPath: '/models/m.gguf' });
      const result = await engine.generate({ messages });

      expect(result.timeToFirstTokenMs).toBe(3000);
      expect(result.tokensPerSecond).toBeCloseTo(4); // 4 tokens / 1s, not / 4s
      jest.useRealTimers();
    });

    it('reports no rate rather than dividing by zero', async () => {
      // Only reachable with a mocked engine — real generation always takes
      // measurable time — but the guard keeps a 0ms elapsed from producing
      // Infinity in the UI.
      await engine.load({ modelPath: '/models/m.gguf' });
      const result = await engine.generate({ messages });
      expect(result.tokensPerSecond).toBeNull();
    });
  });

  describe('unload', () => {
    it('releases the context and clears state', async () => {
      await engine.load({ modelPath: '/models/m.gguf' });
      await engine.unload();
      expect(mockRelease).toHaveBeenCalledTimes(1);
      expect(engine.isLoaded).toBe(false);
      expect(engine.engineInfo).toBeNull();
    });

    it('is safe to call when nothing is loaded', async () => {
      await expect(engine.unload()).resolves.toBeUndefined();
      expect(mockRelease).not.toHaveBeenCalled();
    });
  });
});
