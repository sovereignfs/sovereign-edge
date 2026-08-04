import { readSearchConfig, writeSearchConfig } from './config';

/**
 * Mocks `expo-file-system` the same way `permissions/grants.test.ts` does —
 * a minimal in-memory stand-in for the one file this module reads and
 * writes, not a full filesystem.
 */
const mockFiles = new Map<string, string>();

jest.mock('expo-file-system', () => ({
  Paths: { document: '/doc' },
  Directory: class {
    exists = true;
    create() {}
  },
  File: class {
    private path: string;
    constructor(_dir: unknown, name: string) {
      this.path = name;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    textSync() {
      return mockFiles.get(this.path) ?? '';
    }
    write(text: string) {
      mockFiles.set(this.path, text);
    }
  },
}));

describe('search config', () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it('reads null when never configured', () => {
    expect(readSearchConfig()).toBeNull();
  });

  it('round-trips a SearXNG configuration', () => {
    writeSearchConfig({
      provider: 'searxng',
      searxngUrl: 'https://searx.example.org',
    });
    expect(readSearchConfig()).toEqual({
      provider: 'searxng',
      searxngUrl: 'https://searx.example.org',
    });
  });

  it('round-trips a Tavily configuration', () => {
    writeSearchConfig({ provider: 'tavily' });
    expect(readSearchConfig()).toEqual({ provider: 'tavily' });
  });

  it('overwrites a prior configuration on provider switch', () => {
    writeSearchConfig({
      provider: 'searxng',
      searxngUrl: 'https://searx.example.org',
    });
    writeSearchConfig({ provider: 'tavily' });
    expect(readSearchConfig()).toEqual({ provider: 'tavily' });
  });

  it('fails closed on corrupt state rather than throwing', () => {
    mockFiles.set('search-config.json', 'not json');
    expect(readSearchConfig()).toBeNull();
  });
});
