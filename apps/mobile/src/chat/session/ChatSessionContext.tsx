import { createContext, useContext } from 'react';

import type { ChatMessage } from '../inference';
import type { Message } from './messages';

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
  /**
   * Whether, and how eagerly, this reply may reach a connector (task 2.5;
   * `'required'` added by the explicit Search mode that followed it).
   *
   * `'off'` (default): never — chat's own view of "conversation, not
   * transform." The writing-assist modes are documented as transformations
   * of the text handed to them, not conversations, and offering a connector
   * to "Fix grammar" is a category error even before asking whether one is
   * installed.
   *
   * `'auto'`: the model decides whether a tool is needed (plain Chat mode).
   * Found unreliable on-device — a small model sometimes skips a tool it
   * should use, and at least once claimed to have searched when it had
   * not — which is exactly what `'required'` exists to remove.
   *
   * `'required'`: every message searches. The Search mode's own selection
   * *is* the decision; nothing is asked of the model at all.
   *
   * Not a plain boolean — `false` cannot also mean "and skip asking the
   * model," so a tri-state avoids a fourth, invalid combination existing in
   * the type at all.
   */
  connectorMode?: 'off' | 'auto' | 'required';
};

/**
 * What a reply resolves to.
 *
 * Deliberately narrow rather than re-exporting the inference engine's own
 * `GenerateResult` — `ChatScreen` never reads its other fields, and once a
 * reply may have taken a routing detour through a connector (task 2.5),
 * per-call metrics like `tokensGenerated` stop meaning one clear thing
 * anyway (which call's tokens — the routing decision's, or the follow-up
 * answer's?). `connector` is the one fact task 2.5 exists to add.
 */
export type ChatGenerateResult = {
  text: string;
  /** Name of the connector whose data is in this reply, or null when the
   * reply came entirely from the local model. */
  connector: string | null;
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
  generate(request: GenerateRequest): Promise<ChatGenerateResult>;
  /**
   * The persisted, single conversation thread (task: conversation
   * persistence). Reads/writes go through here rather than `ChatScreen`
   * importing `expo-file-system` directly, for the same reason `generate`
   * exists at all: `src/chat/` may not touch the filesystem, so the app
   * shell owns the actual storage and this is the shape `ChatScreen` needs
   * from it.
   */
  loadHistory(): Message[];
  saveHistory(messages: Message[]): void;
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
