import { MESSAGE_HISTORY_CHAR_BUDGET, type Message } from '@/chat/session/messages';

import { readHistory, writeHistory } from './chatHistoryStore';

/**
 * Mocks `expo-file-system` the same minimal way `installed.test.ts` and
 * `grants.test.ts` do — an in-memory stand-in for the one file this module
 * reads and writes.
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

function message(id: string, content: string): Message {
  return { id, role: 'user', content };
}

describe('readHistory / writeHistory', () => {
  beforeEach(() => {
    mockFiles.clear();
  });

  it('reads an empty thread when nothing has been saved', () => {
    expect(readHistory()).toEqual([]);
  });

  it('round-trips a saved thread', () => {
    const messages = [message('1', 'hi'), message('2', 'hello')];
    writeHistory(messages);
    // `streaming` comes back explicitly `false` even though `message()`
    // never sets it — read always normalizes the flag, not only when it
    // was actually `true` (see the streaming-flag test below).
    expect(readHistory()).toEqual(
      messages.map((m) => ({ ...m, streaming: false })),
    );
  });

  it('fails closed on corrupt state rather than throwing', () => {
    mockFiles.set('history.json', 'not json');
    expect(readHistory()).toEqual([]);
  });

  // A message frozen mid-generation by the app being killed shouldn't show
  // a permanent streaming cursor the next time the thread loads.
  it('clears a stale streaming flag on read', () => {
    writeHistory([{ id: '1', role: 'assistant', content: 'partial', streaming: true }]);
    expect(readHistory()).toEqual([
      { id: '1', role: 'assistant', content: 'partial', streaming: false },
    ]);
  });

  it('caps an over-budget thread on read, in case the budget shrank since it was written', () => {
    const big = 'x'.repeat(MESSAGE_HISTORY_CHAR_BUDGET);
    writeHistory([message('old', 'evict me'), message('new', big)]);
    expect(readHistory().map((m) => m.id)).toEqual(['new']);
  });
});
