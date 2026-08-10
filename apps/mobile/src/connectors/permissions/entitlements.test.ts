import type {
  ConnectorManifestTier1,
  ConnectorManifest,
} from '@sovereignfs/connector-sdk';
import searchManifest from '@sovereignfs/connector-sdk/src/fixtures/search.manifest.json';

import {
  grantEntitlement,
  hasEntitlement,
  isConnectorUsable,
  listEntitlements,
  revokeEntitlement,
} from './entitlements';

/**
 * Mocks `expo-file-system` the same way `store/installed.test.ts` and
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

const freeManifest = searchManifest as unknown as ConnectorManifest;
const paidManifest = {
  ...(searchManifest as ConnectorManifestTier1),
  id: 'fs.sovereign.paid-example',
  pricing: {
    model: 'paid' as const,
    productId: 'fs.sovereign.paid-example.unlock',
  },
} as ConnectorManifest;

describe('entitlements', () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it('has no entitlements by default', () => {
    expect(hasEntitlement('fs.sovereign.paid-example')).toBe(false);
    expect(listEntitlements()).toEqual([]);
  });

  it('round-trips a granted entitlement', () => {
    const record = grantEntitlement(
      'fs.sovereign.paid-example',
      'dev-override',
    );
    expect(record.connectorId).toBe('fs.sovereign.paid-example');
    expect(record.source).toBe('dev-override');
    expect(typeof record.grantedAt).toBe('string');
    expect(hasEntitlement('fs.sovereign.paid-example')).toBe(true);
    expect(listEntitlements()).toEqual([record]);
  });

  it('revokes an entitlement', () => {
    grantEntitlement('fs.sovereign.paid-example', 'dev-override');
    revokeEntitlement('fs.sovereign.paid-example');
    expect(hasEntitlement('fs.sovereign.paid-example')).toBe(false);
  });

  it('revoking an id that was never entitled is a no-op', () => {
    grantEntitlement('fs.sovereign.paid-example', 'dev-override');
    revokeEntitlement('fs.sovereign.never-entitled');
    expect(hasEntitlement('fs.sovereign.paid-example')).toBe(true);
  });

  it('fails closed on corrupt state rather than throwing', () => {
    mockFiles.set('entitlements.json', 'not json');
    expect(hasEntitlement('fs.sovereign.paid-example')).toBe(false);
    expect(listEntitlements()).toEqual([]);
  });

  describe('isConnectorUsable', () => {
    it('a free connector is always usable', () => {
      expect(isConnectorUsable(freeManifest)).toBe(true);
    });

    it('a paid connector with no entitlement is not usable', () => {
      expect(isConnectorUsable(paidManifest)).toBe(false);
    });

    it('a paid connector with a recorded entitlement is usable', () => {
      grantEntitlement(paidManifest.id, 'dev-override');
      expect(isConnectorUsable(paidManifest)).toBe(true);
    });

    it('a paid connector stops being usable once its entitlement is revoked', () => {
      grantEntitlement(paidManifest.id, 'dev-override');
      revokeEntitlement(paidManifest.id);
      expect(isConnectorUsable(paidManifest)).toBe(false);
    });
  });
});
