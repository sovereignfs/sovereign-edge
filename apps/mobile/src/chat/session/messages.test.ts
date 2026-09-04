import {
  capMessages,
  MESSAGE_HISTORY_CHAR_BUDGET,
  type Message,
} from './messages';

function message(id: string, content: string): Message {
  return { id, role: 'user', content };
}

describe('capMessages', () => {
  it('leaves a short conversation untouched', () => {
    const messages = [message('1', 'hi'), message('2', 'hello there')];
    expect(capMessages(messages)).toEqual(messages);
  });

  it('drops the oldest whole messages, oldest first, once over budget', () => {
    const big = 'x'.repeat(MESSAGE_HISTORY_CHAR_BUDGET);
    const messages = [
      message('old', 'this should get evicted'),
      message('new', big),
    ];
    const result = capMessages(messages);
    expect(result.map((m) => m.id)).toEqual(['new']);
  });

  it('never splits a message — evicts whole messages only', () => {
    const messages = [
      message('1', 'a'.repeat(1000)),
      message('2', 'b'.repeat(1000)),
      message('3', 'c'.repeat(1000)),
    ];
    const result = capMessages(messages);
    for (const m of result) {
      const original = messages.find((o) => o.id === m.id)!;
      expect(m.content).toBe(original.content);
    }
  });

  it('always keeps at least the most recent message, even if it alone exceeds the budget', () => {
    const huge = 'x'.repeat(MESSAGE_HISTORY_CHAR_BUDGET * 2);
    const messages = [message('old', 'short'), message('new', huge)];
    expect(capMessages(messages).map((m) => m.id)).toEqual(['new']);
  });

  it('returns an empty list unchanged', () => {
    expect(capMessages([])).toEqual([]);
  });
});
