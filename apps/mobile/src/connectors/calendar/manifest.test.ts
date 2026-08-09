import { validateManifest } from '@sovereignfs/connector-sdk';

import { CALENDAR_CONNECTOR_IDS, CALENDAR_MANIFESTS } from './manifest';

describe('calendar manifests', () => {
  it('has exactly four manifests', () => {
    expect(CALENDAR_MANIFESTS).toHaveLength(4);
  });

  it('every manifest validates against the real connector-sdk schema', () => {
    for (const manifest of CALENDAR_MANIFESTS) {
      const result = validateManifest(manifest);
      expect(result.valid).toBe(true);
    }
  });

  it('every manifest has a distinct id', () => {
    const ids = new Set(CALENDAR_MANIFESTS.map((m) => m.id));
    expect(ids.size).toBe(4);
    expect(CALENDAR_CONNECTOR_IDS).toEqual(CALENDAR_MANIFESTS.map((m) => m.id));
  });

  it('every manifest declares its own handler capability as its permission scope', () => {
    // The validator's cross-field rule (validate.ts's tier3CrossFieldIssues)
    // requires handler.capability to be a member of
    // permissions.device.capabilities — confirmed above by every manifest
    // actually validating; this asserts the specific shape rather than just
    // "it passes."
    for (const manifest of CALENDAR_MANIFESTS) {
      expect(manifest.permissions.device.capabilities).toEqual([
        manifest.handler.capability,
      ]);
    }
  });

  it('every manifest has a distinct handler capability', () => {
    const handlerCapabilities = new Set(
      CALENDAR_MANIFESTS.map((m) => m.handler.capability),
    );
    expect(handlerCapabilities.size).toBe(4);
  });

  it('every manifest declares itself mobile-only', () => {
    for (const manifest of CALENDAR_MANIFESTS) {
      expect(manifest.platforms).toEqual(['ios', 'android']);
    }
  });
});
