import type {
  ChatMessage,
  InferenceEngine,
  ToolDefinition,
} from '../../chat/inference';
import type { ConnectorManifest } from '../manifest';
import { isAllowed } from '../permissions';
import type { RoutingDecision } from './types';

/** Passed straight through to the engine, so a caller streaming a normal
 * chat reply keeps doing so through a routed one. */
export type RouteOptions = {
  onToken?: (token: string) => void;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
};

/**
 * Tool-routing / intent-detection layer (task 2.3).
 *
 * One completion call does double duty: offering each available connector's
 * tool lets the model itself decide "this needs a connector" vs. "just
 * answer," rather than a separate classifier trying to guess intent ahead of
 * generation. `llama.rn` converts each tool's JSON Schema `parameters` into a
 * decoding grammar, so a model that does call a tool is constrained to emit
 * a declared tool name with arguments shaped like that tool's schema — this
 * function trusts that guarantee rather than re-validating arguments against
 * the schema itself.
 *
 * Deliberately does not execute anything. Turning a `tool-call` decision into
 * an HTTP request is task 2.4's job.
 */
export async function routeMessage(
  engine: InferenceEngine,
  manifests: ConnectorManifest[],
  messages: ChatMessage[],
  options: RouteOptions = {},
): Promise<RoutingDecision> {
  const { onToken, signal, temperature, maxTokens } = options;

  // Two different reasons to offer nothing, both ending in an ordinary
  // generated reply rather than silence: no connector exists to offer
  // (common in production today — no connector ships until task 3.1), or one
  // exists but this model's chat template can't emit tool calls at all
  // (`toolCapable`, per research 0004). The `kind` still distinguishes them
  // — "nothing to offer" is not the same fact as "couldn't use what's
  // there" — but neither should mean the user gets no answer at all, which
  // returning early without generating anything used to do.
  if (manifests.length === 0 || !engine.engineInfo?.toolCapable) {
    const result = await engine.generate({
      messages,
      onToken,
      signal,
      temperature,
      maxTokens,
    });
    return manifests.length === 0
      ? { kind: 'answered', text: result.text }
      : { kind: 'unsupported', text: result.text };
  }

  const tools: ToolDefinition[] = manifests.map((manifest) => ({
    type: 'function',
    function: {
      name: manifest.tool.name,
      description: manifest.tool.description,
      parameters: manifest.tool.parameters,
    },
  }));

  // `onToken` is deliberately not forwarded here, unlike the branch above.
  // This completion doubles as the tool-decision call, and a model that does
  // call a tool is not guaranteed to keep the tool-call syntax out of its
  // raw token stream — measured on-device, a small model emitted a literal
  // `<tool_call>{...}` block as ordinary text ahead of choosing to call it.
  // Streaming that live would show it to the user for the fraction of a
  // second it takes to find out this text was never the answer. `result.text`
  // below carries the same content once the outcome says it is safe to show.
  const result = await engine.generate({
    messages,
    tools,
    toolChoice: 'auto',
    signal,
    temperature,
    maxTokens,
  });

  const call = result.toolCalls[0];
  if (!call) {
    onToken?.(result.text);
    return { kind: 'answered', text: result.text };
  }

  const manifest = manifests.find((m) => m.tool.name === call.name);
  if (!manifest) {
    return { kind: 'blocked', toolName: call.name, reason: 'no-connector' };
  }

  if (!isAllowed(manifest)) {
    return {
      kind: 'blocked',
      toolName: call.name,
      reason: 'not-permitted',
      connectorId: manifest.id,
    };
  }

  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    // Grammar-constrained decoding should make this unreachable, but the
    // arguments are still model output steered by whatever the user pasted
    // into chat — untrusted, per research 0004 — so it is checked rather
    // than assumed.
    return {
      kind: 'blocked',
      toolName: call.name,
      reason: 'malformed',
      connectorId: manifest.id,
    };
  }

  return {
    kind: 'tool-call',
    connectorId: manifest.id,
    toolName: call.name,
    arguments: args,
  };
}
