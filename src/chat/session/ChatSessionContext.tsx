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

/**
 * One request for a reply.
 *
 * An options object rather than a growing positional list — it mirrors the
 * engine's own `generate`, and writing-assist modes (task 1.4) already needed
 * to add a fourth argument.
 */
export type GenerateRequest = {
  messages: ChatMessage[];
  onToken: (token: string) => void;
  signal?: AbortSignal;
  /** Per-mode sampling temperature; the engine's default applies when unset. */
  temperature?: number;
};

export type ChatSession = {
  status: ChatSessionStatus;
  /** Human-readable name of the loaded model, when there is one. */
  modelName: string | null;
  /**
   * Its parameter count in billions, for capability decisions.
   *
   * Task 1.4 measured a cliff here rather than a gradient: on 0.5B the Draft
   * mode invented a price that was never in the input, and on 1B the same
   * input and prompt did not. Modes that generate prose need to know.
   */
  modelParametersB: number | null;
  /** Error text when `status` is 'error', otherwise a progress note or null. */
  detail: string | null;
  generate(request: GenerateRequest): Promise<GenerateResult>;
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
