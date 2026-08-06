import { Directory, File, Paths } from 'expo-file-system';

import type { ConnectorManifest } from '../manifest';
import type { ConnectorGrant, GrantState } from './types';
import { openVault } from './vault';

/**
 * The record of which connectors the user has allowed (task 2.2).
 *
 * Grants live in a plain JSON file, not the keychain: they are not secrets,
 * and keeping them readable means a user can inspect what they have agreed to
 * without the app mediating. Credentials are the opposite and live in
 * `vault.ts`, which is why the two are separate files rather than one store.
 *
 * Everything here operates on a single connector at a time. There is no
 * "grant all" and no app-wide network switch, because a blanket toggle is the
 * exact shape research 0001 rules out.
 */

const GRANTS_DIRNAME = 'connectors';
const GRANTS_FILENAME = 'grants.json';

function grantsFile(): File {
  const dir = new Directory(Paths.document, GRANTS_DIRNAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, GRANTS_FILENAME);
}

type GrantRecord = Record<string, ConnectorGrant>;

function readAll(): GrantRecord {
  const file = grantsFile();
  if (!file.exists) return {};
  try {
    return JSON.parse(file.textSync()) as GrantRecord;
  } catch {
    // Corrupt state fails closed: no grants, so nothing reaches the network
    // until the user decides again. The opposite default would silently
    // restore access the record can no longer account for.
    return {};
  }
}

function writeAll(record: GrantRecord): void {
  grantsFile().write(JSON.stringify(record, null, 2));
}

export function grantFor(connectorId: string): ConnectorGrant {
  return (
    readAll()[connectorId] ?? {
      connectorId,
      state: 'not-asked',
      decidedAt: null,
      grantedScope: [],
    }
  );
}

export function listGrants(): ConnectorGrant[] {
  return Object.values(readAll());
}

function setGrant(
  connectorId: string,
  state: GrantState,
  grantedScope: string[],
): ConnectorGrant {
  const record = readAll();
  const grant: ConnectorGrant = {
    connectorId,
    state,
    decidedAt: new Date().toISOString(),
    grantedScope,
  };
  record[connectorId] = grant;
  writeAll(record);
  return grant;
}

/**
 * What a manifest declares access to, tier-agnostic (task 2.6): origins for
 * Tier 1, native capabilities for Tier 3. The one thing `grant()`,
 * `needsRedecision()`, and the settings UI need to agree on.
 */
export function connectorScope(manifest: ConnectorManifest): string[] {
  switch (manifest.tier) {
    case 1:
      return manifest.permissions.network.origins;
    case 3:
      return manifest.permissions.device.capabilities;
  }
}

/**
 * Records consent for exactly the scope this manifest declares.
 *
 * The scope is copied rather than referenced, so a later connector update
 * that widens it does not inherit this decision — see `needsRedecision`.
 */
export function grant(manifest: ConnectorManifest): ConnectorGrant {
  return setGrant(manifest.id, 'granted', connectorScope(manifest));
}

export function deny(connectorId: string): ConnectorGrant {
  return setGrant(connectorId, 'denied', []);
}

/**
 * Revokes one connector's access and destroys its stored credentials.
 *
 * Both halves matter. Leaving the token behind after a revoke means "revoked"
 * describes the UI rather than the device, and a later re-grant would silently
 * reuse a secret the user believed was gone.
 *
 * Scoped to one connector by construction: the vault handle can only address
 * its own namespace, so this cannot reach another connector's credentials
 * even if asked to.
 */
export async function revoke(manifest: ConnectorManifest): Promise<void> {
  // Only Tier 1 stores credentials — a Tier 3 native handler has no
  // app-managed secret of its own to clear.
  const keys =
    manifest.tier === 1
      ? (manifest.permissions.credentials ?? []).map((c) => c.key)
      : [];
  await openVault(manifest.id).clear(keys);
  setGrant(manifest.id, 'denied', []);
}

/**
 * Whether a granted connector must be asked about again.
 *
 * True when it now declares scope the user never agreed to — an origin for
 * Tier 1, a native capability for Tier 3. A connector update is the natural
 * moment for scope to creep, and consent given for one scope is not consent
 * for a larger one.
 */
export function needsRedecision(manifest: ConnectorManifest): boolean {
  const existing = grantFor(manifest.id);
  if (existing.state !== 'granted') return false;

  const agreed = new Set(existing.grantedScope);
  return connectorScope(manifest).some((s) => !agreed.has(s));
}

/**
 * The single question the runtime asks before any request.
 *
 * Deliberately not a boolean on its own — a connector that is granted but has
 * since widened its scope is not allowed, and callers must not have to
 * remember to check that separately.
 */
export function isAllowed(manifest: ConnectorManifest): boolean {
  return (
    grantFor(manifest.id).state === 'granted' && !needsRedecision(manifest)
  );
}
