import type { ConnectorManifestTier1 } from '@sovereignfs/connector-sdk';
import searchManifest from '@sovereignfs/connector-sdk/src/fixtures/search.manifest.json';

import {
  readInstalledConnectors,
  removeInstalledConnector,
  saveInstalledConnector,
} from './installed';

/**
 * Mocks `expo-file-system` the same way `search/config.test.ts` and
 * `permissions/grants.test.ts` do — a minimal in-memory stand-in for the
 * one file this module reads and writes.
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

const manifest = searchManifest as ConnectorManifestTier1;

describe('installed connectors', () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it('reads an empty list when nothing has been installed', () => {
    expect(readInstalledConnectors()).toEqual([]);
  });

  it('round-trips a saved connector', () => {
    saveInstalledConnector(manifest);
    expect(readInstalledConnectors()).toEqual([manifest]);
  });

  it('overwrites rather than duplicates on re-install of the same id', () => {
    saveInstalledConnector(manifest);
    saveInstalledConnector({ ...manifest, version: '2.0.0' });
    const installed = readInstalledConnectors();
    expect(installed).toHaveLength(1);
    expect(installed[0]?.version).toBe('2.0.0');
  });

  it('keeps multiple distinct connectors', () => {
    saveInstalledConnector(manifest);
    saveInstalledConnector({ ...manifest, id: 'fs.sovereign.another' });
    expect(readInstalledConnectors()).toHaveLength(2);
  });

  it('removes a connector by id', () => {
    saveInstalledConnector(manifest);
    removeInstalledConnector(manifest.id);
    expect(readInstalledConnectors()).toEqual([]);
  });

  it('removing an id that was never installed is a no-op', () => {
    saveInstalledConnector(manifest);
    removeInstalledConnector('fs.sovereign.never-installed');
    expect(readInstalledConnectors()).toEqual([manifest]);
  });

  it('fails closed on corrupt state rather than throwing', () => {
    mockFiles.set('installed.json', 'not json');
    expect(readInstalledConnectors()).toEqual([]);
  });
});
