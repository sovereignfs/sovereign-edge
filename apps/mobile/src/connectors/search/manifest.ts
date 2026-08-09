import type { ConnectorManifestTier1 } from '@sovereignfs/connector-sdk';

/**
 * The Search connector's manifests (task 3.1).
 *
 * Two providers, one connector. Both build the identical `web_search` tool —
 * the model never knows or chooses which backend answers it, only the user
 * does, in the setup screen. Sharing one connector id (`CONNECTOR_ID`) across
 * providers is deliberate: switching providers changes
 * `permissions.network.origins`, which `needsRedecision()` (task 2.2) already
 * treats as requiring a fresh grant — a provider switch is a new network
 * destination and deserves one, and that fell out of the existing permission
 * model for free rather than needing new code.
 */

export const CONNECTOR_ID = 'fs.sovereign.search';

const SEARCH_TOOL = {
  name: 'web_search',
  description:
    'Search the web for current information the model does not know.',
  parameters: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'What to search for, in plain language.',
      },
    },
    required: ['query'],
  },
};

/**
 * Builds a manifest for a user-configured SearXNG(-compatible) instance.
 *
 * `instanceUrl` must already be an origin — scheme, host, optional port,
 * nothing else — the same shape `validateManifest`'s `originIssue` check
 * requires. No credential: a self-hosted instance is assumed open within the
 * user's own trust boundary. Self-hosting (and any TLS in front of it) is the
 * user's responsibility, not this app's — the manifest schema requires
 * `https` regardless of whether the instance is on a LAN, matching how the
 * Sovereign Tasks connector (task 4.2) is expected to be reached.
 */
export function buildSearxngManifest(
  instanceUrl: string,
): ConnectorManifestTier1 {
  return {
    manifestVersion: 1,
    id: CONNECTOR_ID,
    name: 'Search (SearXNG)',
    version: '1.0.0',
    summary: 'Searches the web via your configured SearXNG instance.',
    tier: 1,
    platforms: ['ios', 'android'],
    tool: SEARCH_TOOL,
    permissions: {
      network: { origins: [instanceUrl] },
    },
    request: {
      method: 'GET',
      origin: instanceUrl,
      path: [{ literal: 'search' }],
      query: {
        q: { slot: 'query' },
        format: { literal: 'json' },
      },
    },
    // The whole results array, not one field — task 2.4's second-pass
    // generation call already asks the model to answer using whatever text
    // comes back, so summarizing raw results is its job, not a template's.
    response: { textFrom: 'results', maxBytes: 200_000 },
    pricing: { model: 'free' },
  };
}

/**
 * The Tavily manifest is fully static — unlike SearXNG, the origin never
 * varies per user, only the API key does, and that already flows through the
 * existing per-connector vault (task 2.2) with no manifest change needed.
 *
 * The credential is the complete `Authorization` header value, `Bearer
 * tvly-…`, not just the key. A `ValueSource` inserts a stored credential
 * verbatim — no interpolation, by design (research 0004) — so there is
 * nowhere in the manifest to add the `Bearer ` prefix. The setup screen adds
 * it once, when the key is saved, not here.
 */
export const TAVILY_MANIFEST: ConnectorManifestTier1 = {
  manifestVersion: 1,
  id: CONNECTOR_ID,
  name: 'Search (Tavily)',
  version: '1.0.0',
  summary: 'Searches the web via the Tavily API.',
  tier: 1,
  platforms: ['ios', 'android'],
  tool: SEARCH_TOOL,
  permissions: {
    network: { origins: ['https://api.tavily.com'] },
    credentials: [{ key: 'apiKey', label: 'Tavily API key' }],
  },
  request: {
    method: 'POST',
    origin: 'https://api.tavily.com',
    path: [{ literal: 'search' }],
    body: {
      query: { slot: 'query' },
    },
    headers: {
      Authorization: { credential: 'apiKey' },
    },
  },
  response: { textFrom: 'results', maxBytes: 200_000 },
  pricing: { model: 'free' },
};
