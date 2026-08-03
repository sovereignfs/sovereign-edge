import type {
  ChatMessage,
  InferenceEngine,
  ToolDefinition,
} from '../../chat/inference';
import type { ConnectorManifest } from '../manifest';
import { isAllowed } from '../permissions';
import type { RoutingDecision } from './types';

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
): Promise<RoutingDecision> {
  // A fact about the model, not the connector — per research 0004, offering
  // tools to a model whose chat template can't emit them would not fail
  // cleanly, so the honest move is not to offer them at all.
  if (!engine.engineInfo?.toolCapable) {
    return { kind: 'unsupported' };
  }

  const tools: ToolDefinition[] = manifests.map((manifest) => ({
    type: 'function',
    function: {
      name: manifest.tool.name,
      description: manifest.tool.description,
      parameters: manifest.tool.parameters,
    },
  }));

  const result = await engine.generate({ messages, tools, toolChoice: 'auto' });

  const call = result.toolCalls[0];
  if (!call) {
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
