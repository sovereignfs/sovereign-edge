import { Directory, File, Paths } from 'expo-file-system';

import type { ConnectorManifest } from '@sovereignfs/connector-sdk';

/**
 * Store-installed connector manifests (task 5.5).
 *
 * Before this, "which connectors does this device have" was never a real,
 * persisted concept — `ConnectorsScreen`/`ModelSessionProvider` both just
 * rebuilt the first-party Search manifest from its own config on the fly.
 * A registry-installed connector has no such build-it-from-config path (it's
 * arbitrary third-party data), so its manifest has to be persisted verbatim
 * once installed — this file is that persistence, in the same plain-JSON,
 * `expo-file-system`-backed shape `search/config.ts` and `permissions/
 * grants.ts` already use.
 *
 * Keyed by connector id, not an array, so installing the same connector
 * twice (e.g. re-installing after a registry update) overwrites rather than
 * duplicates.
 */

const INSTALLED_DIRNAME = 'connectors';
const INSTALLED_FILENAME = 'installed.json';

function installedFile(): File {
  const dir = new Directory(Paths.document, INSTALLED_DIRNAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, INSTALLED_FILENAME);
}

type InstalledRecord = Record<string, ConnectorManifest>;

function readAll(): InstalledRecord {
  const file = installedFile();
  if (!file.exists) return {};
  try {
    return JSON.parse(file.textSync()) as InstalledRecord;
  } catch {
    // Corrupt state fails closed, same as grants.ts and search/config.ts:
    // an unreadable file reads as "nothing installed" rather than silently
    // keeping stale entries nothing can confirm.
    return {};
  }
}

function writeAll(record: InstalledRecord): void {
  installedFile().write(JSON.stringify(record, null, 2));
}

export function readInstalledConnectors(): ConnectorManifest[] {
  return Object.values(readAll());
}

export function saveInstalledConnector(manifest: ConnectorManifest): void {
  const record = readAll();
  record[manifest.id] = manifest;
  writeAll(record);
}

export function removeInstalledConnector(connectorId: string): void {
  const record = readAll();
  delete record[connectorId];
  writeAll(record);
}
