import type { InferenceEngine } from '../../chat/inference';
import type { ConnectorManifest } from '../manifest';
import searchManifest from '../manifest/fixtures/search.manifest.json';
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

  it('reports unsupported when the loaded model cannot call tools', async () => {
    const generate = jest.fn();
    const engine = fakeEngine(false, generate);

    const decision = await routeMessage(engine, [search], messages);

    expect(decision).toEqual({ kind: 'unsupported' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('answers directly when the model does not call a tool', async () => {
    const generate = jest
      .fn()
      .mockResolvedValue({ text: 'Here is an idea.', toolCalls: [] });
    const engine = fakeEngine(true, generate);

    const decision = await routeMessage(engine, [search], messages);

    expect(decision).toEqual({ kind: 'answered', text: 'Here is an idea.' });
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
