/**
 * Manager behaviour. Names are `mock`-prefixed because Jest hoists
 * `jest.mock()` factories above the surrounding declarations.
 */
import { listChatModels, listEmbeddingModels } from './catalog';
import { ModelManager, type LoadedModelHandle } from './manager';

const mockInstalled = new Set<string>();
const mockRemoveModel = jest.fn((id: string) => mockInstalled.delete(id));
const mockDownloadModel = jest.fn(async () => ({}));
/** Stands in for the on-disk `active-model.json`. */
const mockActive = { id: null as string | null };

jest.mock('./store', () => ({
  isInstalled: (id: string) => mockInstalled.has(id),
  listInstalled: () => [...mockInstalled].map((id) => ({ id })),
  modelFile: (id: string) => ({ uri: `file:///models/${id}.gguf` }),
  removeModel: (id: string) => mockRemoveModel(id),
  // The real one returns null once the file it names is gone, so a model
  // deleted outside the app degrades to a first-launch default.
  readActiveModelId: () =>
    mockActive.id && mockInstalled.has(mockActive.id) ? mockActive.id : null,
  writeActiveModelId: (id: string | null) => {
    mockActive.id = id;
  },
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
    mockActive.id = null;
  });

  describe('list', () => {
    it('annotates every chat catalog entry with install state and fit', () => {
      mockInstalled.add(SMALL);
      const list = new ModelManager().list();

      expect(list).toHaveLength(listChatModels().length);
      expect(list.find((m) => m.id === SMALL)?.installed).toBe(true);
      expect(list.find((m) => m.id === LARGE)?.installed).toBe(false);
      expect(list.every((m) => typeof m.fit.note === 'string')).toBe(true);
    });

    it('omits embedding models — they are not something the user chats with', () => {
      // Task 16.1. The knowledge base's embedding model shares the catalog
      // with the chat models, and this method feeds the model manager screen
      // and the active-model picker; an embedding model reaching either would
      // let the user select a model that cannot generate text at all.
      const list = new ModelManager().list();
      const embeddingIds = listEmbeddingModels().map((e) => e.id);

      expect(embeddingIds).not.toHaveLength(0);
      for (const id of embeddingIds) {
        expect(list.find((m) => m.id === id)).toBeUndefined();
      }
    });

    it('exposes embedding models separately, annotated the same way', () => {
      const embedding = new ModelManager().listEmbedding();

      expect(embedding).toHaveLength(listEmbeddingModels().length);
      expect(embedding.every((m) => typeof m.fit.note === 'string')).toBe(true);
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
    it('passes the descriptor straight through to the downloader', async () => {
      // Verification policy lives in verifyFile, not here. Every catalog entry
      // carries the publisher's SHA-256, which native hashing checks in
      // seconds, so the manager no longer second-guesses the digest situation.
      await new ModelManager().install('llama-3.2-1b-instruct-q4km');
      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'llama-3.2-1b-instruct-q4km' }),
        {},
      );
    });

    it('forwards caller options unchanged', async () => {
      await new ModelManager().install(SMALL, { deepVerify: true });
      expect(mockDownloadModel).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ deepVerify: true }),
      );
    });

    it('refuses an unknown model id', async () => {
      await expect(
        new ModelManager().install('not-a-model'),
      ).rejects.toMatchObject({ code: 'storage' });
    });
  });

  describe('preferredModelId', () => {
    it('remembers the model the user chose', async () => {
      // Without this the app loaded whichever *catalog* entry happened to be
      // installed first, so switching to a later one silently reverted on the
      // next launch. Task 1.4 measured Draft fabricating on the smallest
      // model, which makes a silent revert to it a safety problem, not just
      // an annoyance.
      mockInstalled.add(SMALL);
      mockInstalled.add(LARGE);

      new ModelManager().markActive(LARGE);

      // A fresh manager stands in for the next app launch.
      expect(new ModelManager().preferredModelId()).toBe(LARGE);
    });

    it('falls back to the first installed model on a first launch', () => {
      mockInstalled.add(SMALL);
      mockInstalled.add(LARGE);
      expect(new ModelManager().preferredModelId()).toBe(SMALL);
    });

    it('falls back when the remembered model is gone', async () => {
      // The file can vanish without the app: an OS clean-up, a restore onto a
      // new device. Startup must degrade to the default rather than fail.
      mockInstalled.add(SMALL);
      mockInstalled.add(LARGE);
      const manager = new ModelManager();
      manager.markActive(LARGE);

      mockInstalled.delete(LARGE);

      expect(new ModelManager().preferredModelId()).toBe(SMALL);
    });

    it('returns null when nothing is installed', () => {
      expect(new ModelManager().preferredModelId()).toBeNull();
    });

    it('forgets the choice when that model is deleted', async () => {
      mockInstalled.add(SMALL);
      mockInstalled.add(LARGE);
      const manager = new ModelManager({ engine: fakeEngine(true) });
      manager.markActive(LARGE);

      await manager.remove(LARGE);

      expect(new ModelManager().preferredModelId()).toBe(SMALL);
    });

    it('forgets a stored choice deleted without being loaded first', async () => {
      // The stored id outlives the session that set it, so `remove` cannot
      // rely on `activeId` alone to know the preference points at this model.
      mockInstalled.add(SMALL);
      mockInstalled.add(LARGE);
      new ModelManager().markActive(LARGE);

      // A later session that never loaded LARGE deletes it.
      await new ModelManager().remove(LARGE);

      expect(new ModelManager().preferredModelId()).toBe(SMALL);
    });
  });
});
