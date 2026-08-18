import {
  DEFAULT_CONTEXT_SIZE,
  DEFAULT_MAX_TOKENS,
  type ChatMessage,
} from '../inference';

/**
 * A message in the chat screen's own list — `ChatMessage` plus the
 * UI/persistence fields it doesn't need. The persisted, single-thread
 * conversation this app keeps (`session/history.ts`, in `src/settings/` —
 * outside `src/chat/`, which may not touch the filesystem) is an array of
 * these, kept to a bounded size by `capMessages` below rather than expired
 * by time: a long-running conversation and one resumed after days apart are
 * treated identically, both just "the capped list."
 */
export type Message = ChatMessage & {
  id: string;
  streaming?: boolean;
  /** Name of the connector that produced this reply, if any (task 2.5). */
  connector?: string;
};

/**
 * ~4 chars/token — the same rough English-text estimate
 * `connectorOrchestration.ts`'s `CONNECTOR_RESULT_CHAR_BUDGET` already
 * budgets by, reused here rather than pulling in a real tokenizer. No
 * tokenizer is available before a model has finished loading anyway, and
 * different models tokenize differently — a character estimate is the one
 * measure that means the same thing regardless of which model happens to be
 * loaded when this file is read or written.
 */
const CHARS_PER_TOKEN_ESTIMATE = 4;

/**
 * Headroom for a writing-assist mode's system prompt, which sits alongside
 * — not inside — the persisted history in the request `routeMessage`
 * actually sends (see `ChatScreen.send`).
 */
const SYSTEM_PROMPT_RESERVE_TOKENS = 100;

/**
 * The conversation's size budget, in characters: the model's own context
 * window, minus room for the next reply's output, minus a system-prompt
 * reserve. Derived from `DEFAULT_CONTEXT_SIZE`/`DEFAULT_MAX_TOKENS` rather
 * than a standalone number, so it can't quietly drift from the actual
 * ceiling `engine.ts` generates against — this repo already had one real
 * bug shaped exactly like that (task 2.4's connector-result truncation,
 * found on-device against a real response that alone exhausted the default
 * context).
 *
 * Deliberately not model-relative even though `contextSize` is technically
 * per-load: every model in today's catalog loads at the same
 * `DEFAULT_CONTEXT_SIZE`, so a fixed budget means the same thing regardless
 * of which model happens to be loaded — a real property a per-model budget
 * would give up for an adaptiveness nothing here needs yet.
 */
export const MESSAGE_HISTORY_CHAR_BUDGET =
  (DEFAULT_CONTEXT_SIZE - DEFAULT_MAX_TOKENS - SYSTEM_PROMPT_RESERVE_TOKENS) *
  CHARS_PER_TOKEN_ESTIMATE;

/**
 * Sliding window: drops the oldest whole messages, oldest first, until the
 * total is back within budget. Never splits a message, and always leaves at
 * least the most recent one — even a single message somehow larger than the
 * whole budget on its own is kept rather than the list being emptied out
 * from under whoever just sent it.
 */
export function capMessages(messages: Message[]): Message[] {
  let total = messages.reduce((sum, m) => sum + m.content.length, 0);
  let start = 0;
  while (total > MESSAGE_HISTORY_CHAR_BUDGET && start < messages.length - 1) {
    total -= messages[start]!.content.length;
    start++;
  }
  return messages.slice(start);
}
