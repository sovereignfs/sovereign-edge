import type { ChatMessage, InferenceEngine } from '@/chat/inference';
import {
  executeConnectorCall,
  routeMessage,
  type ConnectorManifest,
  type ExecutionResult,
  type RoutingDecision,
} from '@/connectors';

/**
 * Connector orchestration for the live chat loop (task 2.5).
 *
 * The one place `RoutingDecision` (task 2.3) and `ExecutionResult`
 * (task 2.4) meet a user-facing reply. Lives here rather than in
 * `src/chat/` because `src/chat/` may not import `src/connectors/` —
 * the same reasoning `ModelSessionProvider` already gives for touching
 * `ModelManager` from the app shell instead. Kept as a plain function,
 * independent of React, so it is unit-testable the same way `routeMessage`
 * and `executeConnectorCall` are: a fake engine, no rendering involved.
 *
 * `onToken` is forwarded straight into the tool-decision completion, the
 * same call that would otherwise produce the plain answer — so the common
 * case (no connector installed, or nothing that needed one) keeps streaming
 * exactly as it did before this task. The trade: if a model does choose to
 * call a tool, any stray preamble text it streamed before that decision
 * stays visible under the real answer rather than being cleared. Accepted
 * deliberately rather than solved speculatively — no connector ships until
 * task 3.1, so there is nothing to observe this against yet. Revisit once
 * there is.
 */

export type ConnectorOrchestrationRequest = {
  messages: ChatMessage[];
  onToken?: (token: string) => void;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
};

export type ConnectorOrchestrationResult = {
  text: string;
  /** Name of the connector whose data is in this reply. Null whenever the
   * reply came entirely from the local model — including a `blocked` or
   * failed connector attempt, which explains itself in `text` rather than
   * being tagged as if a connector had actually answered. */
  connector: string | null;
};

function connectorName(
  manifests: ConnectorManifest[],
  id: string | undefined,
): string {
  return manifests.find((m) => m.id === id)?.name ?? 'that connector';
}

function blockedMessage(
  decision: Extract<RoutingDecision, { kind: 'blocked' }>,
  manifests: ConnectorManifest[],
): string {
  switch (decision.reason) {
    case 'not-permitted': {
      const name = connectorName(manifests, decision.connectorId);
      return (
        `This would use ${name}, which hasn't been granted access. ` +
        'Open Settings → Connectors to allow it.'
      );
    }
    case 'no-connector':
      return "That doesn't match anything this app currently has a connector for.";
    case 'malformed':
      return "That didn't come back in a shape this app could use. Try asking again.";
  }
}

function executionFailureMessage(
  result: Extract<ExecutionResult, { ok: false }>,
  name: string,
): string {
  switch (result.reason) {
    case 'not-permitted':
      return (
        `This would use ${name}, which hasn't been granted access. ` +
        'Open Settings → Connectors to allow it.'
      );
    case 'missing-credential':
      return `${name} needs a credential that hasn't been set up yet.`;
    case 'invalid-arguments':
      return `That request to ${name} couldn't be built from what was asked. Try rephrasing.`;
    case 'network-error':
      return `Couldn't reach ${name} right now.`;
    case 'redirected':
      return `${name} tried to redirect the request, so it was refused for safety.`;
    case 'http-error':
      return `${name} returned an error.`;
    case 'response-too-large':
      return `${name}'s response was too large to use.`;
    case 'malformed-response':
      return `${name}'s response wasn't in a shape this app could use.`;
  }
}

/**
 * Routes a message, executes a connector if one was called, and returns a
 * reply plus which connector (if any) produced it.
 *
 * Never throws for a routing or execution failure — those become an honest,
 * specific `text` explaining what happened, per task 2.3's original
 * requirement to explain rather than silently fail. A thrown error here
 * would mean an engine or programming fault, not a connector saying no.
 */
export async function generateWithConnectors(
  engine: InferenceEngine,
  manifests: ConnectorManifest[],
  request: ConnectorOrchestrationRequest,
): Promise<ConnectorOrchestrationResult> {
  const { messages, onToken, signal, temperature, maxTokens } = request;

  const decision = await routeMessage(engine, manifests, messages, {
    onToken,
    signal,
    temperature,
    maxTokens,
  });

  switch (decision.kind) {
    case 'answered':
    case 'unsupported':
      return { text: decision.text, connector: null };

    case 'blocked':
      return { text: blockedMessage(decision, manifests), connector: null };

    case 'tool-call': {
      const manifest = manifests.find((m) => m.id === decision.connectorId);
      if (!manifest) {
        // routeMessage only ever names a connector from the list it was
        // given, so this is unreachable in practice — narrowed defensively
        // rather than asserted past.
        return {
          text: "That doesn't match anything this app currently has a connector for.",
          connector: null,
        };
      }

      const result = await executeConnectorCall(manifest, decision.arguments);
      if (!result.ok) {
        return {
          text: executionFailureMessage(result, manifest.name),
          connector: null,
        };
      }

      // Not stored in `messages` and never sent again next turn — the
      // connector's raw result is context for this one answer, not part of
      // the visible or remembered conversation. Left as a system message
      // rather than a typed `tool` role: only one connector call deep, no
      // multi-hop agentic loop, so the extra plumbing has nothing to earn
      // its keep against yet.
      const followUp: ChatMessage[] = [
        ...messages,
        {
          role: 'system',
          content:
            `Result from ${manifest.name}: ${result.text}\n\n` +
            "Answer the user's question using this information.",
        },
      ];
      const final = await engine.generate({
        messages: followUp,
        onToken,
        signal,
        temperature,
        maxTokens,
      });
      return { text: final.text, connector: manifest.name };
    }
  }
}
