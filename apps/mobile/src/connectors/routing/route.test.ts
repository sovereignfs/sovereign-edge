import type { InferenceEngine } from '../../chat/inference';
import type { ConnectorManifest } from '@sovereignfs/connector-sdk';
import searchManifest from '@sovereignfs/connector-sdk/src/fixtures/search.manifest.json';
import { routeMessage } from './route';

/**
 * `isAllowed` reads from the on-disk grant store (task 2.2); mocked here so
 * routing's own branching is what's under test, not permission persistence.
 */
const mockIsAllowed = jest.fn();
jest.mock('../permissions', () => ({
  isAllowed: (...args: unknown[]) => mockIsAllowed(...args),
}));

const search = searchManifest as ConnectorManifest;
const messages = [{ role: 'user' as const, content: 'find me a recipe' }];

function fakeEngine(
  toolCapable: boolean,
  generate: InferenceEngine['generate'],
): InferenceEngine {
  return {
    get engineInfo() {
      return toolCapable ? { toolCapable } : null;
    },
    generate,
  } as unknown as InferenceEngine;
}

describe('routeMessage', () => {
  beforeEach(() => {
    mockIsAllowed.mockReset();
  });

  it('reports unsupported but still answers when the loaded model cannot call tools', async () => {
    // A tool-incapable model must not mean silence — the model still
    // generates an ordinary reply, just without tools ever offered.
    const generate = jest
      .fn()
      .mockResolvedValue({ text: 'plain reply', toolCalls: [] });
    const engine = fakeEngine(false, generate);

    const decision = await routeMessage(engine, [search], messages);

    expect(decision).toEqual({ kind: 'unsupported', text: 'plain reply' });
    expect(generate).toHaveBeenCalledWith(
      expect.not.objectContaining({ tools: expect.anything() }),
    );
  });

  it('answers plainly without offering tools when no connector is installed', async () => {
    // The common case in production today: no connector ships until task
    // 3.1, so this is what every message hits. Distinct from `unsupported`
    // — nothing here says anything about the model's own capability.
    const generate = jest
      .fn()
      .mockResolvedValue({ text: 'plain reply', toolCalls: [] });
    const engine = fakeEngine(true, generate);

    const decision = await routeMessage(engine, [], messages);

    expect(decision).toEqual({ kind: 'answered', text: 'plain reply' });
    expect(generate).toHaveBeenCalledWith(
      expect.not.objectContaining({ tools: expect.anything() }),
    );
  });

  it('answers plainly with no connectors even when the model cannot call tools', async () => {
    // toolCapable is irrelevant when there is nothing to offer regardless.
    const generate = jest
      .fn()
      .mockResolvedValue({ text: 'plain reply', toolCalls: [] });
    const engine = fakeEngine(false, generate);

    const decision = await routeMessage(engine, [], messages);

    expect(decision).toEqual({ kind: 'answered', text: 'plain reply' });
  });

  it('forwards streaming and generation options when nothing is offered', async () => {
    // The manifests-empty / not-toolCapable branch is unconditionally the
    // final answer, so it is safe to stream live.
    const generate = jest.fn().mockResolvedValue({ text: 'ok', toolCalls: [] });
    const engine = fakeEngine(true, generate);
    const onToken = jest.fn();
    const signal = new AbortController().signal;

    await routeMessage(engine, [], messages, {
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

  it('forwards generation options but not onToken when tools are offered', async () => {
    // Not live-streamed: this completion doubles as the tool-decision call
    // and may contain literal tool-call syntax ahead of a decision. See the
    // next two tests for what the caller actually sees.
    const generate = jest.fn().mockResolvedValue({ text: 'ok', toolCalls: [] });
    const engine = fakeEngine(true, generate);
    const onToken = jest.fn();
    const signal = new AbortController().signal;

    await routeMessage(engine, [search], messages, {
      onToken,
      signal,
      temperature: 0.3,
      maxTokens: 128,
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ signal, temperature: 0.3, maxTokens: 128 }),
    );
    expect(generate.mock.calls[0]![0]).not.toHaveProperty('onToken');
  });

  it('defaults toolChoice to auto', async () => {
    const generate = jest.fn().mockResolvedValue({ text: 'ok', toolCalls: [] });
    const engine = fakeEngine(true, generate);

    await routeMessage(engine, [search], messages);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ toolChoice: 'auto' }),
    );
  });

  it('forwards a caller-specified toolChoice, for the explicit Search mode', async () => {
    // The mode's own selection is the decision in that case, not something
    // asked of the model — 'required' forces a tool call rather than
    // offering the model a choice to (sometimes unreliably) make itself.
    const generate = jest.fn().mockResolvedValue({ text: 'ok', toolCalls: [] });
    const engine = fakeEngine(true, generate);

    await routeMessage(engine, [search], messages, { toolChoice: 'required' });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ toolChoice: 'required' }),
    );
  });

  it('answers directly when the model does not call a tool, flushing onToken once', async () => {
    const generate = jest
      .fn()
      .mockResolvedValue({ text: 'Here is an idea.', toolCalls: [] });
    const engine = fakeEngine(true, generate);
    const onToken = jest.fn();

    const decision = await routeMessage(engine, [search], messages, {
      onToken,
    });

    expect(decision).toEqual({ kind: 'answered', text: 'Here is an idea.' });
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith('Here is an idea.');
  });

  it('reports malformed and never calls onToken when a tool call leaks into text unparsed', async () => {
    // Reproduces an on-device finding: Llama 3.2 1B Instruct's
    // `<|python_tag|>` tool-call format wasn't recognised by llama.rn's
    // structured `tool_calls` parser, so it came back empty while `text`
    // still held the raw call — for a totally unrelated question, no less.
    const generate = jest.fn().mockResolvedValue({
      text: '<|python_tag|>{"name": "calendar_query_events", "parameters": {"startDate": "2020-01-01", "endDate": "2020-12-31"}}; {"name": "device_set_brightness", "parameters": {"value": "0"}}',
      toolCalls: [],
    });
    const engine = fakeEngine(true, generate);
    const onToken = jest.fn();

    const decision = await routeMessage(engine, [search], messages, {
      onToken,
    });

    expect(decision).toEqual({
      kind: 'blocked',
      toolName: 'calendar_query_events',
      reason: 'malformed',
    });
    expect(onToken).not.toHaveBeenCalled();
  });

  it('answers plainly when text merely mentions tool-shaped words, not leaked syntax', async () => {
    // Guards the detector against false positives on ordinary prose that
    // happens to discuss names or JSON, so it doesn't itself become a new
    // way to swallow real answers.
    const generate = jest.fn().mockResolvedValue({
      text: 'A JSON object often looks like {"name": "value"} in examples.',
      toolCalls: [],
    });
    const engine = fakeEngine(true, generate);
    const onToken = jest.fn();

    const decision = await routeMessage(engine, [search], messages, {
      onToken,
    });

    expect(decision.kind).toBe('answered');
    expect(onToken).toHaveBeenCalledTimes(1);
  });

  it('never calls onToken when a tool is called instead of answering', async () => {
    // The whole point of buffering: a tool call's raw text — which can
    // contain literal tool-call syntax — must never reach the visible chat.
    mockIsAllowed.mockReturnValue(true);
    const generate = jest.fn().mockResolvedValue({
      text: '<tool_call>{"name":"web_search"}</tool_call>',
      toolCalls: [
        { name: 'web_search', arguments: '{"query":"chili recipe"}' },
      ],
    });
    const engine = fakeEngine(true, generate);
    const onToken = jest.fn();

    await routeMessage(engine, [search], messages, { onToken });

    expect(onToken).not.toHaveBeenCalled();
  });

  it('offers every manifest as a tool, by name and JSON-Schema parameters', async () => {
    const generate = jest.fn().mockResolvedValue({ text: '', toolCalls: [] });
    const engine = fakeEngine(true, generate);

    await routeMessage(engine, [search], messages);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages,
        toolChoice: 'auto',
        tools: [
          {
            type: 'function',
            function: {
              name: 'web_search',
              description: search.tool.description,
              parameters: search.tool.parameters,
            },
          },
        ],
      }),
    );
  });

  it('returns a tool-call decision for a permitted connector', async () => {
    mockIsAllowed.mockReturnValue(true);
    const generate = jest.fn().mockResolvedValue({
      text: '',
      toolCalls: [
        { name: 'web_search', arguments: '{"query":"chili recipe"}' },
      ],
    });
    const engine = fakeEngine(true, generate);

    const decision = await routeMessage(engine, [search], messages);

    expect(decision).toEqual({
      kind: 'tool-call',
      connectorId: 'fs.sovereign.search',
      toolName: 'web_search',
      arguments: { query: 'chili recipe' },
    });
  });

  it('blocks with not-permitted rather than silently dropping the call', async () => {
    mockIsAllowed.mockReturnValue(false);
    const generate = jest.fn().mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'web_search', arguments: '{"query":"x"}' }],
    });
    const engine = fakeEngine(true, generate);

    const decision = await routeMessage(engine, [search], messages);

    expect(decision).toEqual({
      kind: 'blocked',
      toolName: 'web_search',
      reason: 'not-permitted',
      connectorId: 'fs.sovereign.search',
    });
  });

  it('blocks with no-connector when the called tool matches nothing offered', async () => {
    const generate = jest.fn().mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'not_a_real_tool', arguments: '{}' }],
    });
    const engine = fakeEngine(true, generate);

    const decision = await routeMessage(engine, [search], messages);

    expect(decision).toEqual({
      kind: 'blocked',
      toolName: 'not_a_real_tool',
      reason: 'no-connector',
    });
    expect(mockIsAllowed).not.toHaveBeenCalled();
  });

  it('blocks with malformed rather than throwing on unparsable arguments', async () => {
    mockIsAllowed.mockReturnValue(true);
    const generate = jest.fn().mockResolvedValue({
      text: '',
      toolCalls: [{ name: 'web_search', arguments: 'not json' }],
    });
    const engine = fakeEngine(true, generate);

    const decision = await routeMessage(engine, [search], messages);

    expect(decision).toEqual({
      kind: 'blocked',
      toolName: 'web_search',
      reason: 'malformed',
      connectorId: 'fs.sovereign.search',
    });
  });
});
