import { Directory, File, Paths } from 'expo-file-system';

import { capMessages, type Message } from '@/chat/session/messages';

/**
 * The one persisted conversation thread's file I/O — plain JSON via
 * `expo-file-system`, the same `Paths.document`-backed pattern already used
 * for connector grants and installed connectors.
 *
 * Lives here, in the app shell, rather than in `src/chat/`: that layer may
 * not import `expo-file-system` (task 1.5's offline boundary — see
 * `eslint.config.js`'s own comment on the rule), the same reason
 * `ModelSessionProvider` owns the engine and model manager instead of
 * `src/chat/` importing them directly. `ChatScreen` reaches this through
 * `ChatSessionContext.loadHistory`/`saveHistory`, which
 * `ModelSessionProvider` implements using these two functions — the same
 * inversion `generate` already uses for the engine.
 */

const HISTORY_DIRNAME = 'chat';
const HISTORY_FILENAME = 'history.json';

function historyFile(): File {
  const dir = new Directory(Paths.document, HISTORY_DIRNAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, HISTORY_FILENAME);
}

/**
 * Reads the persisted thread, capped to the current budget (in case it
 * shrank since this was written) and with every message's `streaming` flag
 * forced off — nothing is actually mid-generation right after a cold load,
 * and a message frozen mid-stream by the app being killed would otherwise
 * show a permanent streaming cursor forever.
 */
export function readHistory(): Message[] {
  const file = historyFile();
  if (!file.exists) return [];
  try {
    const parsed = JSON.parse(file.textSync()) as Message[];
    return capMessages(parsed.map((m) => ({ ...m, streaming: false })));
  } catch {
    // Corrupt state fails closed, same as grants.ts and installed.ts: an
    // unreadable file reads as "no history" rather than surfacing a parse
    // error to a chat screen that has nothing to do about it.
    return [];
  }
}

export function writeHistory(messages: Message[]): void {
  historyFile().write(JSON.stringify(messages, null, 2));
}
