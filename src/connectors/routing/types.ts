/**
 * Tool-routing decisions (task 2.3).
 *
 * `routeMessage` turns one model completion into exactly one of these. The
 * split matters because each case has a different owner downstream:
 * `answered` is a normal chat reply, `tool-call` is a job for the connector
 * runtime host (task 2.4), and `blocked` / `unsupported` are fallback states
 * the epic requires to be explained rather than silently dropped.
 */
export type RoutingDecision =
  /** The model replied directly; no connector was involved. */
  | { kind: 'answered'; text: string }
  /**
   * The model called a permitted connector's tool with well-formed
   * arguments. Execution is task 2.4's job — this is the routing decision
   * only.
   */
  | {
      kind: 'tool-call';
      connectorId: string;
      toolName: string;
      arguments: unknown;
    }
  /**
   * The model tried to call a connector's tool but it can't be honoured.
   * Distinct reasons because the honest message differs: "you haven't
   * granted this" is not "this app doesn't know that connector."
   */
  | {
      kind: 'blocked';
      toolName: string;
      reason: 'no-connector' | 'not-permitted' | 'malformed';
      connectorId?: string;
    }
  /**
   * The loaded model's chat template cannot emit tool calls at all
   * (`EngineInfo.toolCapable`). A fact about the model, not about any
   * connector — no tools were offered, so there is no `blocked` case to
   * report. Still carries `text`: the model answers normally either way, and
   * a caller that has no UI treatment for `unsupported` (task 2.3 left that
   * to whoever wires chat) should not have to special-case "no reply came
   * back at all."
   */
  | { kind: 'unsupported'; text: string };
