import { createContext, useContext } from 'react';

import type { ChatMessage, GenerateResult } from '../inference';

export type ChatSessionStatus =
  /** No model is installed. Chat cannot run at all. */
  | 'no-model'
  /** A model is installed and being loaded into memory. */
  | 'preparing'
  /** Ready to answer. */
  | 'ready'
  /** A reply is being generated. */
  | 'busy'
  /** Loading or generation failed; see `detail`. */
  | 'error';

export type ChatSession = {
  status: ChatSessionStatus;
  /** Human-readable name of the loaded model, when there is one. */
  modelName: string | null;
  /** Error text when `status` is 'error', otherwise a progress note or null. */
  detail: string | null;
  generate(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<GenerateResult>;
};

/**
 * The chat screen's view of inference, deliberately narrow.
 *
 * `src/chat/` must not import anything that opens a socket, and the objects
 * that actually own a model — `ModelManager`, and through it the downloader —
 * do. So this file defines only the shape the UI needs and imports nothing
 * from `src/models/`; the app shell supplies the implementation.
 *
 * The same inversion `ModelManager` uses for its engine handle, in the other
 * direction. It also means one engine instance is shared app-wide rather than
 * each screen constructing its own, which is what keeps the engine's
 * one-context-at-a-time rule true across screens.
 */
export const ChatSessionContext = createContext<ChatSession | null>(null);

export function useChatSession(): ChatSession {
  const session = useContext(ChatSessionContext);
  if (!session) {
    throw new Error('useChatSession must be used within a session provider.');
  }
  return session;
}
