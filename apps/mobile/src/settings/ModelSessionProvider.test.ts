import type { ConnectorManifest } from '@/connectors';

import { connectorsForMode } from './ModelSessionProvider';

/**
 * Only `connectorsForMode` is under test here — the pure manifest-scoping
 * rule `generate()` applies before calling `generateWithConnectors`. The
 * rest of `ModelSessionProvider` (engine/model-manager wiring) needs a much
 * heavier mount and isn't exercised by this file.
 */
function manifest(id: string): ConnectorManifest {
  return {
    manifestVersion: 1,
    id,
    name: id,
    version: '1.0.0',
    summary: 'x',
    tier: 1,
    platforms: ['ios', 'android'],
    tool: { name: 'x', description: 'x', parameters: { type: 'object', properties: {} } },
    permissions: { network: { origins: ['https://example.com'] } },
    request: { method: 'GET', origin: 'https://example.com', path: [] },
    response: { textFrom: 'x', maxBytes: 1000 },
    pricing: { model: 'free' },
  } as ConnectorManifest;
}

const search = manifest('fs.sovereign.search');
const calendar = manifest('fs.sovereign.calendar.create-event');
const device = manifest('fs.sovereign.device.brightness');
const all = [search, calendar, device];

describe('connectorsForMode', () => {
  it('offers every connector in auto mode', () => {
    expect(connectorsForMode(all, 'auto')).toEqual(all);
  });

  it('offers every connector when off (defensive — generate never actually calls this path for off)', () => {
    expect(connectorsForMode(all, 'off')).toEqual(all);
  });

  // The bug this exists to prevent: Search mode's forced tool_choice only
  // guarantees *some* tool gets called, not the search one specifically —
  // without this filter, a message like "turn on the flashlight" sent
  // while in Search mode could legitimately call Device instead of ever
  // touching search.
  it('scopes required (Search) mode to the search connector alone', () => {
    expect(connectorsForMode(all, 'required')).toEqual([search]);
  });

  it('scopes to nothing in required mode when search is not configured', () => {
    expect(connectorsForMode([calendar, device], 'required')).toEqual([]);
  });
});
