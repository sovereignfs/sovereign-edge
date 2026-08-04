import { Directory, File, Paths } from 'expo-file-system';

/**
 * Which search provider is configured, and that provider's own settings
 * (task 3.1).
 *
 * Not a secret — same reasoning `grants.ts` gives for keeping grants in
 * plain JSON rather than the keychain: a user can inspect what they chose
 * without the app mediating. The Tavily API key is the one secret this
 * connector has, and it already lives in the vault (task 2.2), addressed by
 * `CONNECTOR_ID` from `./manifest` — this file only ever holds
 * non-secret configuration.
 *
 * A discriminated union rather than one flat shape with an optional
 * `searxngUrl`: `{ provider: 'tavily', searxngUrl: '…' }` should not be
 * constructible at all, not merely unused.
 */
export type SearchConfig =
  { provider: 'searxng'; searxngUrl: string } | { provider: 'tavily' };

const CONFIG_DIRNAME = 'connectors';
const CONFIG_FILENAME = 'search-config.json';

function configFile(): File {
  const dir = new Directory(Paths.document, CONFIG_DIRNAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, CONFIG_FILENAME);
}

/** Null when never configured, or when the stored file is corrupt. */
export function readSearchConfig(): SearchConfig | null {
  const file = configFile();
  if (!file.exists) return null;
  try {
    return JSON.parse(file.textSync()) as SearchConfig;
  } catch {
    // Fails closed, same as grants.ts: unreadable config reads as
    // unconfigured rather than silently keeping a value nothing can confirm.
    return null;
  }
}

export function writeSearchConfig(config: SearchConfig): void {
  configFile().write(JSON.stringify(config, null, 2));
}
