/**
 * Writing-assist modes (task 1.4).
 *
 * Each mode is a system prompt plus a sampling temperature. Nothing here
 * touches the inference layer — `ChatMessage` already carries a `system` role
 * and `generate` already takes a temperature, so a mode is data, not a code
 * path.
 *
 * The prompts are written for the small end of the catalog. A 0.5B model
 * follows short, concrete, negatively-scoped instructions ("return only the
 * corrected text") far more reliably than a paragraph of persona; anything
 * longer tends to get partially ignored or echoed back as preamble. They are
 * fixed presets rather than user-editable: making them editable brings
 * storage, validation, reset-to-default, and a migration path for when a
 * preset is improved, which is its own task.
 */

export type ModeId = 'plain' | 'brainstorm' | 'grammar' | 'tone' | 'draft';

export type Mode = {
  id: ModeId;
  /** Shown on the chip. Kept to one or two words so the row fits. */
  label: string;
  /** Shown in the chat banner while the mode is active. */
  banner: string;
  /** Prepended as a system message. `null` for plain chat. */
  systemPrompt: string | null;
  /**
   * Sampling temperature. Deliberately varied: a grammar fix should be nearly
   * deterministic, where idea generation is worthless without spread.
   */
  temperature: number;
  /**
   * Whether the conversation so far is sent as context.
   *
   * Only plain chat does. This is not a preference — it was measured. With two
   * prior turns of the model correcting grammar in the transcript, switching to
   * Brainstorm and sending the same text produced *another grammar
   * correction*: a 0.5B model weights the behaviour demonstrated in the
   * transcript above the system instruction. In a fresh conversation the same
   * input returned a list of ideas.
   *
   * These modes are transformations of the text you hand them, not
   * conversations, so dropping history is also the honest model of what they
   * do. The cost is that follow-ups like "more like the third one" don't work
   * inside a mode; switch to Chat for that.
   */
  usesHistory: boolean;
  /**
   * Warn below this parameter count, in billions. `null` for modes that do not
   * need it.
   *
   * Only Draft carries one, and the number is measured rather than guessed.
   * Given "prices rise 5 percent from March, loyal customers get 3 months
   * notice", Qwen2.5 0.5B produced a draft asserting "prices have increased by
   * $100 per customer" — a figure with no source in the input. Llama 3.2 1B,
   * same prompt and input, invented nothing.
   *
   * This matters more than the other rough edges because Draft output is meant
   * to be sent to someone. A fabricated price reads as fluently as a real one,
   * so the user has no cue that anything is wrong.
   */
  cautionBelowB: number | null;
};

export const MODES: readonly Mode[] = [
  {
    id: 'plain',
    label: 'Chat',
    banner: 'Plain chat',
    systemPrompt: null,
    temperature: 0.7,
    usesHistory: true,
    cautionBelowB: null,
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    banner: 'Brainstorming — each message on its own',
    systemPrompt:
      'You generate ideas. Reply with a numbered list of 5 to 8 short, ' +
      'distinct options. Vary them: do not restate one idea in different ' +
      'words. No introduction, no conclusion, no explanation of your ' +
      'reasoning.',
    // High: near-identical options are the failure mode this mode exists to
    // avoid, and a small model at low temperature produces exactly that.
    temperature: 0.95,
    usesHistory: false,
    cautionBelowB: null,
  },
  {
    id: 'grammar',
    label: 'Fix grammar',
    banner: 'Fixing grammar — each message on its own',
    systemPrompt:
      'You correct grammar, spelling, and punctuation. Return only the ' +
      'corrected text. Keep the original wording, tone, and meaning — change ' +
      'nothing that is not an error. Do not comment on the changes. If the ' +
      'text is already correct, return it unchanged.',
    // Low, not zero: this is close to a deterministic transform, and any
    // creativity here shows up as unrequested rewriting.
    temperature: 0.2,
    usesHistory: false,
    cautionBelowB: null,
  },
  {
    id: 'tone',
    label: 'Rewrite tone',
    banner: 'Rewriting tone — each message on its own',
    systemPrompt:
      'You rewrite text in a different tone. If the message names a tone, ' +
      'use it; otherwise make it clear, warm, and professional. Preserve ' +
      'every fact and all intent. Return only the rewritten text.',
    temperature: 0.6,
    usesHistory: false,
    cautionBelowB: null,
  },
  {
    id: 'draft',
    label: 'Draft',
    banner: 'Drafting — each message on its own',
    systemPrompt:
      'You turn notes and bullet points into finished prose. Cover every ' +
      'point given and invent no new facts. Match the length to the input — ' +
      'a few bullets become a short paragraph, not an essay. Return only the ' +
      'draft.',
    temperature: 0.7,
    usesHistory: false,
    cautionBelowB: 1,
  },
] as const;

export const DEFAULT_MODE_ID: ModeId = 'plain';

export function findMode(id: ModeId): Mode {
  const mode = MODES.find((m) => m.id === id);
  // MODES covers every ModeId, so this is unreachable via the type. Throwing
  // rather than falling back keeps a future id added to the union from
  // silently behaving as plain chat.
  if (!mode) throw new Error(`Unknown mode: ${id}`);
  return mode;
}
