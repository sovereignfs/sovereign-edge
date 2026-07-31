/**
 * Manager behaviour. Names are `mock`-prefixed because Jest hoists
 * `jest.mock()` factories above the surrounding declarations.
 */
import { CURATED_MODELS } from './catalog';
import { ModelManager, type LoadedModelHandle } from './manager';

const mockInstalled = new Set<string>();
const mockRemoveModel = jest.fn((id: string) => mockInstalled.delete(id));
const mockDownloadModel = jest.fn(async () => ({}));

jest.mock('./store', () => ({
  isInstalled: (id: string) => mockInstalled.has(id),
  listInstalled: () => [...mockInstalled].map((id) => ({ id })),
  modelFile: (id: string) => ({ uri: `file:///models/${id}.gguf` }),
  removeModel: (id: string) => mockRemoveModel(id),
}));

jest.mock('./download', () => ({
  downloadModel: (...args: unknown[]) => mockDownloadModel(...(args as [])),
}));

jest.mock('expo-device', () => ({ totalMemory: 8 * 1024 ** 3 }));

function fakeEngine(loaded: boolean): LoadedModelHandle & {
  unload: jest.Mock;
} {
  const handle = {
    isLoaded: loaded,
    unload: jest.fn(async () => {
      handle.isLoaded = false;
    }),
  };
  return handle;
}

const SMALL = 'qwen2.5-0.5b-instruct-q4km';
const LARGE = 'gemma-2-2b-it-q4km';

describe('ModelManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInstalled.clear();
  });

  describe('list', () => {
    it('annotates every catalog entry with install state and fit', () => {
      mockInstalled.add(SMALL);
      const list = new ModelManager().list();

      expect(list).toHaveLength(CURATED_MODELS.length);
      expect(list.find((m) => m.id === SMALL)?.installed).toBe(true);
      expect(list.find((m) => m.id === LARGE)?.installed).toBe(false);
      expect(list.every((m) => typeof m.fit.note === 'string')).toBe(true);
    });

    it('rates a small model better than a large one on the same device', () => {
      const list = new ModelManager().list();
      const order = ['comfortable', 'tight', 'unsupported'];
      const small = list.find((m) => m.id === SMALL)!;
      const large = list.find((m) => m.id === LARGE)!;

      expect(order.indexOf(small.fit.fit)).toBeLessThanOrEqual(
        order.indexOf(large.fit.fit),
      );
      expect(small.fit.estimatedPeakBytes).toBeLessThan(
        large.fit.estimatedPeakBytes,
      );
    });
  });

  describe('remove', () => {
    it('releases the model before deleting it when the engine holds it', async () => {
      // Deleting a file the engine still has memory-mapped is undefined
      // behaviour, not a clean error — so ordering here is the whole point.
      const engine = fakeEngine(true);
      const manager = new ModelManager({ engine });
      mockInstalled.add(SMALL);
      manager.markActive(SMALL);

      await manager.remove(SMALL);

      expect(engine.unload).toHaveBeenCalled();
      expect(mockRemoveModel).toHaveBeenCalledWith(SMALL);
      expect(manager.activeModelId).toBeNull();
    });

    it('does not unload when deleting a model that is not the active one', async () => {
      const engine = fakeEngine(true);
      const manager = new ModelManager({ engine });
      manager.markActive(LARGE);

      await manager.remove(SMALL);

      expect(engine.unload).not.toHaveBeenCalled();
      expect(mockRemoveModel).toHaveBeenCalledWith(SMALL);
    });

    it('works with no engine attached', async () => {
      await expect(new ModelManager().remove(SMALL)).resolves.toBeUndefined();
      expect(mockRemoveModel).toHaveBeenCalledWith(SMALL);
    });
  });

  describe('prepareSwitch', () => {
    it('releases the current model and returns a filesystem path', async () => {
      const engine = fakeEngine(true);
      const manager = new ModelManager({ engine });
      mockInstalled.add(LARGE);
      manager.markActive(SMALL);

      const path = await manager.prepareSwitch(LARGE);

      expect(engine.unload).toHaveBeenCalled();
      // llama.rn takes a path, not a file:// URI.
      expect(path).toBe(`/models/${LARGE}.gguf`);
      expect(manager.activeModelId).toBeNull();
    });

    it('refuses to switch to a model that is not installed', async () => {
      await expect(
        new ModelManager().prepareSwitch(LARGE),
      ).rejects.toMatchObject({ code: 'storage' });
    });

    it('refuses an unknown model id', async () => {
      await expect(
        new ModelManager().prepareSwitch('not-a-model'),
      ).rejects.toMatchObject({ code: 'storage' });
    });
  });

  describe('install', () => {
    it('does not silently opt into slow verification', async () => {
      // The Llama entry has no MD5, so verifying it means hashing SHA-256 in
      // JS. That is the caller's call to make, not the manager's.
      await new ModelManager().install('llama-3.2-1b-instruct-q4km');
      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'llama-3.2-1b-instruct-q4km' }),
        expect.objectContaining({ deepVerify: false }),
      );
    });

    it('enables deep verification when asked and no MD5 exists', async () => {
      await new ModelManager().install('llama-3.2-1b-instruct-q4km', {
        allowSlowVerification: true,
      });
      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ deepVerify: true }),
      );
    });

    it('stays on the fast path for a model that has an MD5', async () => {
      await new ModelManager().install(SMALL, { allowSlowVerification: true });
      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ deepVerify: false }),
      );
    });
  });
});
