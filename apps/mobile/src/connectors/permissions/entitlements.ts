import { Directory, File, Paths } from 'expo-file-system';

import type { ConnectorManifest } from '@sovereignfs/connector-sdk';

/**
 * The platform-agnostic notion of "this connector is unlocked for this
 * user," independent of which purchase rail granted it (task 6.1).
 *
 * Deliberately a plain local record, not a signed token: research 0001
 * points at `sovereign`'s own signed-entitlement model (RFC 0003 in that
 * repo) as the concept to mirror, but there is no real issuer to sign
 * against yet — task 6.2 (mobile IAP) and 6.3 (desktop direct sale), the
 * only things that would ever produce a real purchase receipt, don't exist.
 * Building real signature verification now would mean verifying against a
 * key this app itself would have to hold and self-sign with, which proves
 * nothing a plain record doesn't. `source` exists so a later real receipt
 * can be recorded without changing this file's shape or any of its
 * call sites — `grantEntitlement` takes it as an opaque string today
 * (`'dev-override'` is this task's own read; a real caller passes
 * `'ios-iap'`/`'android-iap'`/`'desktop-direct'`) and nothing here inspects
 * it.
 *
 * Same plain-JSON, `expo-file-system`-backed shape `grants.ts` and
 * `store/installed.ts` already use, and lives beside `grants.ts` rather
 * than under `store/`: both files answer "may this connector run," grants
 * for consent, this for payment — `store/` answers "which manifests does
 * this device have" instead.
 */

export interface EntitlementRecord {
  connectorId: string;
  grantedAt: string;
  source: string;
}

const ENTITLEMENTS_DIRNAME = 'connectors';
const ENTITLEMENTS_FILENAME = 'entitlements.json';

function entitlementsFile(): File {
  const dir = new Directory(Paths.document, ENTITLEMENTS_DIRNAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, ENTITLEMENTS_FILENAME);
}

type EntitlementRecordMap = Record<string, EntitlementRecord>;

function readAll(): EntitlementRecordMap {
  const file = entitlementsFile();
  if (!file.exists) return {};
  try {
    return JSON.parse(file.textSync()) as EntitlementRecordMap;
  } catch {
    // Corrupt state fails closed, same as grants.ts/installed.ts: an
    // unreadable file reads as "nothing entitled" rather than silently
    // unlocking a paid connector the record can no longer account for.
    return {};
  }
}

function writeAll(record: EntitlementRecordMap): void {
  entitlementsFile().write(JSON.stringify(record, null, 2));
}

export function hasEntitlement(connectorId: string): boolean {
  return connectorId in readAll();
}

export function listEntitlements(): EntitlementRecord[] {
  return Object.values(readAll());
}

export function grantEntitlement(
  connectorId: string,
  source: string,
): EntitlementRecord {
  const record = readAll();
  const entitlement: EntitlementRecord = {
    connectorId,
    grantedAt: new Date().toISOString(),
    source,
  };
  record[connectorId] = entitlement;
  writeAll(record);
  return entitlement;
}

export function revokeEntitlement(connectorId: string): void {
  const record = readAll();
  delete record[connectorId];
  writeAll(record);
}

/**
 * Whether a connector may install/run at all: free connectors always are;
 * paid ones only with a recorded entitlement. The one check every paid-
 * connector gate (install-time, dispatch-time) should call, rather than
 * each reimplementing `pricing.model === 'paid'`.
 */
export function isConnectorUsable(manifest: ConnectorManifest): boolean {
  return manifest.pricing.model === 'free' || hasEntitlement(manifest.id);
}
