import {
  validateManifest,
  type ConnectorManifest,
} from '@sovereignfs/connector-sdk';

import { allowNetworkForConnector } from '../../chat/session/offlineTripwire';

/**
 * The public connector registry (task 5.4), fetched live (task 5.5).
 *
 * This is the first network access in the app that is not a specific
 * granted connector's own request — it's the store *browsing* the public
 * index, before any install/grant decision exists. `allowNetworkForConnector`
 * is reused rather than given a parallel mechanism: it is already a generic
 * "network access from src/connectors/" door (see its own doc comment), and
 * this call site is exactly that, just not tied to one connector's execution.
 *
 * Deliberately the raw file on `main`, not a versioned/pinned ref: the
 * registry is meant to be current, and this app has no offline cache of it
 * to go stale — every visit to the store re-fetches.
 */
const REGISTRY_URL =
  'https://raw.githubusercontent.com/sovereignfs/sovereign-edge/main/registry/connectors.json';

export type RegistryConnector = {
  id: string;
  submittedBy: { name: string; contact?: string };
  manifest: ConnectorManifest;
};

export type RegistryFetchError =
  { kind: 'network'; detail: string } | { kind: 'malformed'; detail: string };

export type RegistryFetchResult =
  | { ok: true; connectors: RegistryConnector[] }
  | { ok: false; error: RegistryFetchError };

/**
 * Fetches and re-validates the registry.
 *
 * Re-validation is defense in depth, not redundant with `registry/
 * validate.mjs`'s own CI check: that check guards what gets *merged*, this
 * guards what the app actually *loads*, over a network path an attacker
 * with control of DNS/a proxy could tamper with regardless of what CI saw.
 * An entry that fails re-validation is dropped, not treated as a fetch
 * failure — one bad entry should not make the whole store unusable.
 */
export async function fetchConnectorRegistry(): Promise<RegistryFetchResult> {
  let raw: unknown;
  try {
    const res = await allowNetworkForConnector(() => fetch(REGISTRY_URL));
    if (!res.ok) {
      return {
        ok: false,
        error: { kind: 'network', detail: `HTTP ${res.status}` },
      };
    }
    raw = await res.json();
  } catch (cause) {
    return {
      ok: false,
      error: {
        kind: 'network',
        detail: cause instanceof Error ? cause.message : String(cause),
      },
    };
  }

  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as { registryVersion?: unknown }).registryVersion !== 1 ||
    !Array.isArray((raw as { connectors?: unknown }).connectors)
  ) {
    return {
      ok: false,
      error: { kind: 'malformed', detail: 'Not a recognized registry shape.' },
    };
  }

  const entries = (raw as { connectors: unknown[] }).connectors;
  const connectors: RegistryConnector[] = [];

  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { id, submittedBy, manifest } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || id.length === 0) continue;
    if (
      typeof submittedBy !== 'object' ||
      submittedBy === null ||
      typeof (submittedBy as { name?: unknown }).name !== 'string'
    ) {
      continue;
    }

    const result = validateManifest(manifest);
    if (!result.valid) continue;
    if (result.manifest.id !== id) continue;

    connectors.push({
      id,
      submittedBy: submittedBy as { name: string; contact?: string },
      manifest: result.manifest,
    });
  }

  return { ok: true, connectors };
}
