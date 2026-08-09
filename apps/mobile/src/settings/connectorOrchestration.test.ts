import type { InferenceEngine } from '@/chat/inference';
import type { ConnectorManifest } from '@/connectors';
import searchManifest from '@sovereignfs/connector-sdk/src/fixtures/search.manifest.json';

import { generateWithConnectors } from './connectorOrchestration';

/**
 * `routeMessage` and `executeConnectorCall` are exercised on their own
 * (tasks 2.3, 2.4); mocked here so what's under test is purely the
 * orchestration between them — the fallback-message mapping and the
 * second-pass generation, not routing or execution internals.
 */
const mockRouteMessage = jest.fn();
const mockExecuteConnectorCall = jest.fn();
jest.mock('@/connectors', () => ({
  routeMessage: (...args: unknown[]) => mockRouteMessage(...args),
  executeConnectorCall: (...args: unknown[]) =>
    mockExecuteConnectorCall(...args),
}));

const search = searchManifest as ConnectorManifest;
const messages = [{ role: 'user' as const, content: 'find me a recipe' }];

function fakeEngine(generate: InferenceEngine['generate']): InferenceEngine {
  return { generate } as unknown as InferenceEngine;
}

describe('generateWithConnectors', () => {
  beforeEach(() => {
    mockRouteMessage.mockReset();
    mockExecuteConnectorCall.mockReset();
  });

  it('returns an answered reply with no connector tag', async () => {
    mockRouteMessage.mockResolvedValue({ kind: 'answered', text: 'Hi.' });
    const engine = fakeEngine(jest.fn());

    const result = await generateWithConnectors(engine, [search], {
      messages,
    });

    expect(result).toEqual({ text: 'Hi.', connector: null });
    expect(mockExecuteConnectorCall).not.toHaveBeenCalled();
  });

  it('returns an unsupported reply with no connector tag', async () => {
    mockRouteMessage.mockResolvedValue({
      kind: 'unsupported',
      text: 'plain reply',
    });
    const engine = fakeEngine(jest.fn());

    const result = await generateWithConnectors(engine, [search], {
      messages,
    });

    expect(result).toEqual({ text: 'plain reply', connector: null });
  });

  it('forwards streaming and generation options into routeMessage', async () => {
    mockRouteMessage.mockResolvedValue({ kind: 'answered', text: 'Hi.' });
    const engine = fakeEngine(jest.fn());
    const onToken = jest.fn();
    const signal = new AbortController().signal;

    await generateWithConnectors(engine, [search], {
      messages,
      onToken,
      signal,
      temperature: 0.3,
      maxTokens: 128,
    });

    expect(mockRouteMessage).toHaveBeenCalledWith(engine, [search], messages, {
      onToken,
      signal,
      temperature: 0.3,
      maxTokens: 128,
      toolChoice: 'auto',
    });
  });

  it('forwards an explicit toolChoice into routeMessage', async () => {
    mockRouteMessage.mockResolvedValue({ kind: 'answered', text: 'Hi.' });
    const engine = fakeEngine(jest.fn());

    await generateWithConnectors(engine, [search], {
      messages,
      toolChoice: 'required',
    });

    expect(mockRouteMessage).toHaveBeenCalledWith(
      engine,
      [search],
      messages,
      expect.objectContaining({ toolChoice: 'required' }),
    );
  });

  describe('required (explicit Search mode)', () => {
    it('gives a clear message without generating anything when nothing is configured', async () => {
      const engine = fakeEngine(jest.fn());

      const result = await generateWithConnectors(engine, [], {
        messages,
        toolChoice: 'required',
      });

      expect(result).toEqual({
        text: "Search isn't set up yet. Open Settings → Connectors → Search to configure one.",
        connector: null,
      });
      expect(mockRouteMessage).not.toHaveBeenCalled();
    });

    it("gives a clear message rather than the model's own words when the model cannot use connectors", async () => {
      mockRouteMessage.mockResolvedValue({
        kind: 'unsupported',
        text: "I don't have real-time access, but here's what I know...",
      });
      const engine = fakeEngine(jest.fn());

      const result = await generateWithConnectors(engine, [search], {
        messages,
        toolChoice: 'required',
      });

      expect(result).toEqual({
        text: "The loaded model can't use connectors. Try a different model in Models.",
        connector: null,
      });
    });

    it("still passes the model's own words through in auto mode", async () => {
      mockRouteMessage.mockResolvedValue({
        kind: 'unsupported',
        text: 'plain reply',
      });
      const engine = fakeEngine(jest.fn());

      const result = await generateWithConnectors(engine, [search], {
        messages,
      });

      expect(result).toEqual({ text: 'plain reply', connector: null });
    });
  });

  describe('blocked', () => {
    it('names the connector when access has not been granted', async () => {
      mockRouteMessage.mockResolvedValue({
        kind: 'blocked',
        toolName: 'web_search',
        reason: 'not-permitted',
        connectorId: search.id,
      });
      const engine = fakeEngine(jest.fn());

      const result = await generateWithConnectors(engine, [search], {
        messages,
      });

      expect(result).toEqual({
        text: "This would use Search, which hasn't been granted access. Open Settings → Connectors to allow it.",
        connector: null,
      });
    });

    it('explains no-connector without naming one', async () => {
      mockRouteMessage.mockResolvedValue({
        kind: 'blocked',
        toolName: 'not_a_real_tool',
        reason: 'no-connector',
      });
      const engine = fakeEngine(jest.fn());

      const result = await generateWithConnectors(engine, [search], {
        messages,
      });

      expect(result.connector).toBeNull();
      expect(result.text).toMatch(/doesn't match/);
    });

    it('explains malformed output', async () => {
      mockRouteMessage.mockResolvedValue({
        kind: 'blocked',
        toolName: 'web_search',
        reason: 'malformed',
        connectorId: search.id,
      });
      const engine = fakeEngine(jest.fn());

      const result = await generateWithConnectors(engine, [search], {
        messages,
      });

      expect(result.connector).toBeNull();
      expect(result.text).toMatch(/shape this app could use/);
    });
  });

  describe('tool-call', () => {
    const toolCallDecision = {
      kind: 'tool-call' as const,
      connectorId: search.id,
      toolName: 'web_search',
      arguments: { query: 'chili recipe' },
    };

    it('executes, tags the reply with the connector name, and drops the tool result from history', async () => {
      mockRouteMessage.mockResolvedValue(toolCallDecision);
      mockExecuteConnectorCall.mockResolvedValue({
        ok: true,
        text: 'chili recipes found',
      });
      const generate = jest
        .fn()
        .mockResolvedValue({ text: 'Here is a chili recipe.' });
      const engine = fakeEngine(generate);

      const result = await generateWithConnectors(engine, [search], {
        messages,
      });

      expect(mockExecuteConnectorCall).toHaveBeenCalledWith(
        search,
        toolCallDecision.arguments,
      );
      expect(result).toEqual({
        text: 'Here is a chili recipe.',
        connector: 'Search',
      });

      const [{ messages: followUp }] = generate.mock.calls[0] as [
        { messages: { role: string; content: string }[] },
      ];
      expect(followUp).toHaveLength(messages.length + 1);
      expect(followUp.at(-1)).toEqual({
        role: 'system',
        content:
          "Result from Search: chili recipes found\n\nAnswer the user's question using this information.",
      });
    });

    it('truncates an oversized connector result before it reaches the model', async () => {
      // Found on-device: an ordinary SearXNG results array was large enough
      // on its own to exhaust the model's context window and fail
      // generation outright, not just produce a worse answer.
      mockRouteMessage.mockResolvedValue(toolCallDecision);
      mockExecuteConnectorCall.mockResolvedValue({
        ok: true,
        text: 'x'.repeat(5_000),
      });
      const generate = jest.fn().mockResolvedValue({ text: 'answer' });
      const engine = fakeEngine(generate);

      await generateWithConnectors(engine, [search], { messages });

      const [{ messages: followUp }] = generate.mock.calls[0] as [
        { messages: { role: string; content: string }[] },
      ];
      const content = followUp.at(-1)!.content;
      expect(content.length).toBeLessThan(2_100);
      expect(content).toContain('…');
    });

    it('forwards streaming and generation options into the follow-up call', async () => {
      mockRouteMessage.mockResolvedValue(toolCallDecision);
      mockExecuteConnectorCall.mockResolvedValue({ ok: true, text: 'x' });
      const generate = jest.fn().mockResolvedValue({ text: 'answer' });
      const engine = fakeEngine(generate);
      const onToken = jest.fn();
      const signal = new AbortController().signal;

      await generateWithConnectors(engine, [search], {
        messages,
        onToken,
        signal,
        temperature: 0.3,
        maxTokens: 128,
      });

      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          onToken,
          signal,
          temperature: 0.3,
          maxTokens: 128,
        }),
      );
    });

    it.each([
      ['not-permitted', "hasn't been granted access"],
      ['missing-credential', 'needs a credential'],
      ['invalid-arguments', "couldn't be built"],
      ['network-error', "Couldn't reach"],
      ['redirected', 'tried to redirect'],
      ['http-error', 'returned an error'],
      ['response-too-large', 'too large'],
      ['malformed-response', "wasn't in a shape"],
    ] as const)(
      'maps execution failure %s to an honest message, untagged',
      async (reason, expectedFragment) => {
        mockRouteMessage.mockResolvedValue(toolCallDecision);
        mockExecuteConnectorCall.mockResolvedValue({ ok: false, reason });
        const generate = jest.fn();
        const engine = fakeEngine(generate);

        const result = await generateWithConnectors(engine, [search], {
          messages,
        });

        expect(result.connector).toBeNull();
        expect(result.text).toContain('Search');
        expect(result.text).toMatch(new RegExp(expectedFragment));
        expect(generate).not.toHaveBeenCalled();
      },
    );

    it('falls back gracefully if the decision names a connector not in the list', async () => {
      mockRouteMessage.mockResolvedValue({
        ...toolCallDecision,
        connectorId: 'not.installed',
      });
      const engine = fakeEngine(jest.fn());

      const result = await generateWithConnectors(engine, [search], {
        messages,
      });

      expect(result.connector).toBeNull();
      expect(mockExecuteConnectorCall).not.toHaveBeenCalled();
    });
  });
});
