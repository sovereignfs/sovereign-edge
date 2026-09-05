/**
 * Catalog invariants, and the chat/embedding split task 16.1 introduced.
 *
 * The split matters because embedding models live in the same array as chat
 * models — one place for an id, URL, size, and digest — and the only thing
 * keeping them out of the model manager is that callers ask for the right
 * subset. A regression here puts an embedding model in the user's chat
 * picker, where selecting it would load a model that cannot generate text.
 */
import {
  CURATED_MODELS,
  findInCatalog,
  listChatModels,
  listEmbeddingModels,
} from './catalog';

describe('catalog', () => {
  it('has unique ids', () => {
    const ids = CURATED_MODELS.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry a verifiable digest and an exact size', () => {
    for (const entry of CURATED_MODELS) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('points every entry at a direct .gguf download', () => {
    for (const entry of CURATED_MODELS) {
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.url).toMatch(/\.gguf$/);
    }
  });

  describe('chat/embedding split', () => {
    it('excludes embedding models from the chat list', () => {
      const chatIds = listChatModels().map((e) => e.id);

      expect(chatIds).not.toHaveLength(0);
      for (const entry of listChatModels()) {
        expect(entry.kind).not.toBe('embedding');
      }
    });

    it('returns only embedding models from the embedding list', () => {
      const embedding = listEmbeddingModels();

      expect(embedding).not.toHaveLength(0);
      for (const entry of embedding) {
        expect(entry.kind).toBe('embedding');
      }
    });

    it('partitions the catalog exactly — no entry lost or double-counted', () => {
      expect(listChatModels().length + listEmbeddingModels().length).toBe(
        CURATED_MODELS.length,
      );
    });

    it('treats an entry with no kind as a chat model', () => {
      // Every pre-16.1 entry omits `kind`, and none of them should have
      // changed meaning when the field was introduced.
      const untagged = CURATED_MODELS.filter((e) => e.kind === undefined);

      expect(untagged).not.toHaveLength(0);
      const chatIds = new Set(listChatModels().map((e) => e.id));
      for (const entry of untagged) {
        expect(chatIds.has(entry.id)).toBe(true);
      }
    });
  });

  describe('findInCatalog', () => {
    it('finds entries of either kind', () => {
      const embedding = listEmbeddingModels()[0]!;
      const chat = listChatModels()[0]!;

      // The store and its verification path do not care what a model is for,
      // so the lookup must not be split along with the lists.
      expect(findInCatalog(embedding.id)?.id).toBe(embedding.id);
      expect(findInCatalog(chat.id)?.id).toBe(chat.id);
    });

    it('returns undefined for an unknown id', () => {
      expect(findInCatalog('no-such-model')).toBeUndefined();
    });
  });
});
