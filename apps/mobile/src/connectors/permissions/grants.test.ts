import type {
  ConnectorManifestTier1,
  ConnectorManifestTier3,
} from '../manifest';
import deviceInfoManifest from '../manifest/fixtures/device-info.manifest.json';
import searchManifest from '../manifest/fixtures/search.manifest.json';
import {
  connectorScope,
  deny,
  grant,
  grantFor,
  isAllowed,
  listGrants,
  needsRedecision,
  revoke,
} from './grants';
import { openVault } from './vault';

/**
 * Names are `mock`-prefixed because Jest hoists `jest.mock()` factories above
 * the surrounding declarations.
 */
const mockFiles = new Map<string, string>();
const mockKeychain = new Map<string, string>();

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

jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockKeychain.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockKeychain.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    mockKeychain.delete(k);
  },
}));

const search = searchManifest as ConnectorManifestTier1;

/** A second connector, so isolation can actually be observed. */
const tasks: ConnectorManifestTier1 = {
  ...search,
  id: 'fs.sovereign.tasks',
  name: 'Sovereign Tasks',
  permissions: {
    network: { origins: ['https://tasks.example.org'] },
    credentials: [{ key: 'apiToken', label: 'Instance API token' }],
  },
  request: {
    ...search.request,
    origin: 'https://tasks.example.org',
  },
};

describe('connector grants', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockKeychain.clear();
  });

  it('starts at not-asked rather than denied', () => {
    // Absence of a decision is not a refusal. The distinction is what lets
    // the UI avoid re-prompting for something already turned down.
    expect(grantFor(search.id).state).toBe('not-asked');
    expect(isAllowed(search)).toBe(false);
  });

  it('records consent for exactly the declared origins', () => {
    const result = grant(search);
    expect(result.state).toBe('granted');
    expect(result.grantedScope).toEqual(['https://searx.example.org']);
    expect(isAllowed(search)).toBe(true);
  });

  it('keeps a denial distinct from never having asked', () => {
    deny(search.id);
    expect(grantFor(search.id).state).toBe('denied');
    expect(isAllowed(search)).toBe(false);
  });

  describe('revoking one connector leaves every other untouched', () => {
    // Epic 2.2's review checklist, stated as its own block because it is the
    // property the whole design exists to provide.
    it('does not affect another connector s grant', async () => {
      grant(search);
      grant(tasks);

      await revoke(search);

      expect(isAllowed(search)).toBe(false);
      expect(isAllowed(tasks)).toBe(true);
    });

    it('does not touch another connector s stored credentials', async () => {
      await openVault(search.id).write('apiToken', 'search-secret');
      await openVault(tasks.id).write('apiToken', 'tasks-secret');
      grant(search);
      grant(tasks);

      await revoke(search);

      expect(await openVault(search.id).read('apiToken')).toBeNull();
      // Same credential *key* on both connectors — the case a naive key
      // scheme would collide on.
      expect(await openVault(tasks.id).read('apiToken')).toBe('tasks-secret');
    });
  });

  it('destroys credentials when access is revoked', async () => {
    // "Revoked" must describe the device, not the UI. Leaving the token means
    // a later re-grant silently reuses a secret the user believed was gone.
    await openVault(search.id).write('apiToken', 'secret');
    grant(search);

    await revoke(search);

    expect(await openVault(search.id).read('apiToken')).toBeNull();
  });

  describe('scope creep needs a fresh decision', () => {
    it('re-asks when an update adds an origin', () => {
      grant(search);
      const widened: ConnectorManifestTier1 = {
        ...search,
        permissions: {
          ...search.permissions,
          network: {
            origins: [
              'https://searx.example.org',
              'https://analytics.example.com',
            ],
          },
        },
      };

      expect(needsRedecision(widened)).toBe(true);
      // And the runtime's single question answers correctly without the
      // caller having to remember the check.
      expect(isAllowed(widened)).toBe(false);
    });

    it('does not re-ask when an update narrows or keeps the origins', () => {
      grant(search);
      expect(needsRedecision(search)).toBe(false);
      expect(isAllowed(search)).toBe(true);
    });
  });

  it('fails closed when the grant record is corrupt', () => {
    // No grants rather than stale ones: the opposite default would restore
    // access the record can no longer account for.
    grant(search);
    mockFiles.set('grants.json', '{ not json');

    expect(isAllowed(search)).toBe(false);
    expect(listGrants()).toEqual([]);
  });

  it('lists every connector the user has decided on', () => {
    grant(search);
    deny(tasks.id);
    expect(
      listGrants()
        .map((g) => [g.connectorId, g.state])
        .sort(),
    ).toEqual([
      [search.id, 'granted'],
      [tasks.id, 'denied'],
    ]);
  });

  describe('Tier 3 grant scope (task 2.6)', () => {
    const deviceInfo = deviceInfoManifest as ConnectorManifestTier3;

    it('fills the generalized scope with declared capabilities, not origins', () => {
      expect(connectorScope(deviceInfo)).toEqual(['device.info']);

      const result = grant(deviceInfo);
      expect(result.grantedScope).toEqual(['device.info']);
      expect(isAllowed(deviceInfo)).toBe(true);
    });

    it('re-asks when an update adds a capability, same as Tier 1 widening an origin', () => {
      grant(deviceInfo);
      const widened: ConnectorManifestTier3 = {
        ...deviceInfo,
        permissions: {
          device: { capabilities: ['device.info', 'device.torch'] },
        },
      };

      expect(needsRedecision(widened)).toBe(true);
      expect(isAllowed(widened)).toBe(false);
    });

    it('revokes without touching the credential vault, which Tier 3 has no use for', async () => {
      grant(deviceInfo);

      await revoke(deviceInfo);

      expect(isAllowed(deviceInfo)).toBe(false);
      expect(grantFor(deviceInfo.id).state).toBe('denied');
    });

    it('does not affect a Tier 1 connector grant, and vice versa', async () => {
      grant(search);
      grant(deviceInfo);

      await revoke(deviceInfo);

      expect(isAllowed(search)).toBe(true);
      expect(isAllowed(deviceInfo)).toBe(false);
    });
  });
});
