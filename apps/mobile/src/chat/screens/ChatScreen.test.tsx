import { render, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/design-system';

import {
  ChatSessionContext,
  type ChatGenerateResult,
  type ChatSession,
  type ChatSessionStatus,
  type GenerateRequest,
} from '../session/ChatSessionContext';
import { ChatScreen } from './ChatScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const done: ChatGenerateResult = { text: 'ok', connector: null };

function renderChat(overrides: Partial<ChatSession> = {}) {
  const session: ChatSession = {
    status: 'ready' as ChatSessionStatus,
    modelName: 'Qwen2.5 0.5B Instruct',
    modelParametersB: 0.5,
    detail: null,
    generate: jest.fn(async () => done),
    ...overrides,
  };

  const view = render(
    <ThemeProvider initialPreference="light">
      <ChatSessionContext.Provider value={session}>
        <ChatScreen />
      </ChatSessionContext.Provider>
    </ThemeProvider>,
  );
  return { view, session };
}

/**
 * Typed against the real contract so `mock.calls` carries the request shape —
 * casting each call site instead would let a contract change slip past.
 */
const spyGenerate = () => jest.fn(async (_request: GenerateRequest) => done);

describe('ChatScreen', () => {
  it('always shows which trust tier is active', async () => {
    // CONCEPT.md requires this to be visible at all times, not disclosed once.
    const { view } = renderChat();
    expect((await view).getByText(/On-device/)).toBeTruthy();
  });

  it('names the loaded model in the banner', async () => {
    const { view } = renderChat();
    expect((await view).getByText(/Qwen2.5 0.5B Instruct/)).toBeTruthy();
  });

  it('explains the wait while a model is loading', async () => {
    // Loading measured 8.7s on device; a bare spinner reads as hung.
    const { view } = renderChat({
      status: 'preparing',
      detail: 'Loading Qwen2.5 0.5B Instruct. This takes a few seconds.',
    });
    expect((await view).getByText(/takes a few seconds/)).toBeTruthy();
  });

  it('points at the Models screen when nothing is installed', async () => {
    const { view } = renderChat({ status: 'no-model', modelName: null });
    expect((await view).getByText(/No model is installed/)).toBeTruthy();
  });

  it('streams tokens into the reply as they arrive', async () => {
    const generate = jest.fn(
      async ({
        onToken,
      }: {
        onToken: (t: string) => void;
      }): Promise<ChatGenerateResult> => {
        onToken('Blue');
        onToken(', green');
        // Resolves with the same text it streamed, like any real
        // implementation — the UI trusts this as the source of truth.
        return { text: 'Blue, green', connector: null };
      },
    );
    const { view } = renderChat({
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    await userEvent.type(s.getByPlaceholderText('Message'), 'colours?');
    await userEvent.press(s.getByText('Send'));

    expect(s.getByText(/Blue, green/)).toBeTruthy();
  });

  it('sends the conversation so far, without the placeholder reply', async () => {
    // The empty assistant bubble is UI state; sending it as context would put
    // a blank turn in the prompt.
    const generate = jest.fn(async () => done);
    const { view } = renderChat({
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    await userEvent.type(s.getByPlaceholderText('Message'), 'hello');
    await userEvent.press(s.getByText('Send'));

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'hello' }],
        onToken: expect.any(Function),
        signal: expect.any(AbortSignal),
        connectorMode: 'auto',
      }),
    );
  });

  it('shows which connector answered, without opening settings', async () => {
    // The epic 2.5 review checklist, verbatim: a user can tell from the
    // message itself, not by navigating anywhere.
    const generate = jest
      .fn()
      .mockResolvedValue({ text: 'Found a recipe.', connector: 'Search' });
    const { view } = renderChat({
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    await userEvent.type(s.getByPlaceholderText('Message'), 'find a recipe');
    await userEvent.press(s.getByText('Send'));

    expect(s.getByText(/via Search/)).toBeTruthy();
  });

  it('shows a reply that was never streamed a single token', async () => {
    // A `blocked` connector fallback (task 2.5) resolves with real text but
    // calls onToken zero times — nothing to stream, since it was never
    // model output. Caught on-device: content built purely from onToken
    // accumulation stayed permanently empty for exactly this case.
    const generate = jest.fn().mockResolvedValue({
      text: "This would use Search, which hasn't been granted access.",
      connector: null,
    });
    const { view } = renderChat({
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    await userEvent.type(s.getByPlaceholderText('Message'), 'find a recipe');
    await userEvent.press(s.getByText('Send'));

    expect(s.getByText(/hasn't been granted access/)).toBeTruthy();
  });

  it('says nothing about a connector for a purely local reply', async () => {
    const { view } = renderChat();
    const s = await view;

    await userEvent.type(s.getByPlaceholderText('Message'), 'hello');
    await userEvent.press(s.getByText('Send'));

    expect(s.queryByText(/via /)).toBeNull();
  });

  it('never offers connectors from a writing-assist mode', async () => {
    // Fix grammar and the other modes transform the text handed to them —
    // they are not conversations, and should not be able to reach a
    // connector regardless of whether one is installed.
    const generate = spyGenerate();
    const { view } = renderChat({
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    await userEvent.press(s.getByLabelText('Fix grammar mode'));
    await userEvent.type(s.getByPlaceholderText('Message'), 'their going');
    await userEvent.press(s.getByText('Send'));

    expect(generate.mock.calls[0]![0].connectorMode).toBe('off');
  });

  it('forces a connector attempt in Search mode', async () => {
    // The point of the mode: no ambiguity left for the model to (sometimes
    // wrongly) resolve — the mode selection itself is the decision.
    const generate = spyGenerate();
    const { view } = renderChat({
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    await userEvent.press(s.getByLabelText('Search mode'));
    await userEvent.type(
      s.getByPlaceholderText('Message'),
      'weather in Berlin',
    );
    await userEvent.press(s.getByText('Send'));

    expect(generate.mock.calls[0]![0].connectorMode).toBe('required');
  });

  it('names the active mode in the banner for Search, unlike the silent default', async () => {
    const { view } = renderChat();
    const s = await view;

    await userEvent.press(s.getByLabelText('Search mode'));

    expect(s.getByText(/Search — every message/)).toBeTruthy();
  });

  it('offers Stop instead of Send while generating', async () => {
    // The engine supports aborting; leaving only a disabled Send would make
    // the user wait out a reply they no longer want.
    const generate = jest.fn(async () => done);
    const { view } = renderChat({
      status: 'busy',
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    expect(s.getByText('Stop')).toBeTruthy();
    expect(s.queryByText('Send')).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  describe('writing-assist modes', () => {
    it('sends no system prompt in plain chat', async () => {
      // The default must stay an ordinary conversation; a persona nobody
      // chose would change every answer without explanation.
      const generate = spyGenerate();
      const { view } = renderChat({
        generate: generate as ChatSession['generate'],
      });
      const s = await view;

      await userEvent.type(s.getByPlaceholderText('Message'), 'hi');
      await userEvent.press(s.getByText('Send'));

      const { messages } = generate.mock.calls[0]![0];
      expect(messages.some((m) => m.role === 'system')).toBe(false);
    });

    it('prepends the selected mode as a system message', async () => {
      const generate = spyGenerate();
      const { view } = renderChat({
        generate: generate as ChatSession['generate'],
      });
      const s = await view;

      await userEvent.press(s.getByLabelText('Fix grammar mode'));
      await userEvent.type(s.getByPlaceholderText('Message'), 'their going');
      await userEvent.press(s.getByText('Send'));

      const { messages, temperature } = generate.mock.calls[0]![0];
      expect(messages[0]!.role).toBe('system');
      expect(messages[0]!.content).toMatch(/only the corrected text/i);
      // A grammar fix is close to a deterministic transform; creativity here
      // shows up as unrequested rewriting.
      expect(temperature).toBeLessThan(0.5);
    });

    it('gives brainstorming a materially different temperature', async () => {
      // The epic's checklist asks that each mode transform the same input
      // differently. Prompt aside, near-identical options are brainstorming's
      // failure mode and low temperature is what causes them.
      const generate = spyGenerate();
      const { view } = renderChat({
        generate: generate as ChatSession['generate'],
      });
      const s = await view;

      await userEvent.press(s.getByLabelText('Brainstorm mode'));
      await userEvent.type(s.getByPlaceholderText('Message'), 'names');
      await userEvent.press(s.getByText('Send'));

      const { temperature } = generate.mock.calls[0]![0];
      expect(temperature).toBeGreaterThan(0.8);
    });

    it('names the active mode in the banner', async () => {
      // The mode is sticky. One that is not shown silently transforms
      // whatever the user types next.
      const { view } = renderChat();
      const s = await view;

      await userEvent.press(s.getByLabelText('Brainstorm mode'));

      expect(s.getByText(/Brainstorming/)).toBeTruthy();
    });

    it('stays on until switched back', async () => {
      const generate = spyGenerate();
      const { view } = renderChat({
        generate: generate as ChatSession['generate'],
      });
      const s = await view;

      await userEvent.press(s.getByLabelText('Fix grammar mode'));
      await userEvent.type(s.getByPlaceholderText('Message'), 'one');
      await userEvent.press(s.getByText('Send'));
      await userEvent.type(s.getByPlaceholderText('Message'), 'two');
      await userEvent.press(s.getByText('Send'));

      const second = generate.mock.calls[1]![0];
      expect(second.messages[0]!.role).toBe('system');
    });

    it('sends a mode only the current message, not the conversation', async () => {
      // Measured on an emulator, not reasoned about: with two grammar
      // corrections in the transcript, switching to Brainstorm and sending the
      // same text produced a third grammar correction. A 0.5B model follows
      // the behaviour demonstrated in the transcript over the system prompt.
      // The same input in a fresh conversation returned a list of ideas.
      const generate = spyGenerate();
      const { view } = renderChat({
        generate: generate as ChatSession['generate'],
      });
      const s = await view;

      await userEvent.press(s.getByLabelText('Fix grammar mode'));
      await userEvent.type(s.getByPlaceholderText('Message'), 'first');
      await userEvent.press(s.getByText('Send'));
      await userEvent.type(s.getByPlaceholderText('Message'), 'second');
      await userEvent.press(s.getByText('Send'));

      const { messages } = generate.mock.calls[1]![0];
      // System prompt plus this message only — no trace of the first turn.
      expect(messages).toHaveLength(2);
      expect(messages[1]).toEqual({ role: 'user', content: 'second' });
      expect(messages.some((m) => m.content.includes('first'))).toBe(false);
    });

    it('still sends the conversation in plain chat', async () => {
      // The history drop is scoped to modes; ordinary chat must stay a
      // conversation rather than a series of unrelated questions.
      const generate = spyGenerate();
      const { view } = renderChat({
        generate: generate as ChatSession['generate'],
      });
      const s = await view;

      await userEvent.type(s.getByPlaceholderText('Message'), 'first');
      await userEvent.press(s.getByText('Send'));
      await userEvent.type(s.getByPlaceholderText('Message'), 'second');
      await userEvent.press(s.getByText('Send'));

      const { messages } = generate.mock.calls[1]![0];
      expect(messages.some((m) => m.content === 'first')).toBe(true);
    });

    it('warns that a small model may invent details in a draft', async () => {
      // Measured: on Qwen2.5 0.5B, "prices rise 5 percent from March" produced
      // a draft asserting "$100 per customer". Draft output is meant to be
      // sent, and a fabricated figure reads as fluently as a real one.
      const { view } = renderChat({ modelParametersB: 0.5 });
      const s = await view;

      await userEvent.press(s.getByLabelText('Draft mode'));

      expect(s.getByText(/invent details/)).toBeTruthy();
    });

    it('does not warn once the model is large enough', async () => {
      // Llama 3.2 1B invented nothing on the same input and prompt. A warning
      // shown regardless of model would be noise, and noise gets ignored.
      const { view } = renderChat({
        modelName: 'Llama 3.2 1B Instruct',
        modelParametersB: 1,
      });
      const s = await view;

      await userEvent.press(s.getByLabelText('Draft mode'));

      expect(s.queryByText(/invent details/)).toBeNull();
    });

    it('does not warn for modes that were not observed fabricating', async () => {
      // Fix grammar returns the user's own words corrected; there is nothing
      // for it to invent. Warning there would dilute the one that matters.
      const { view } = renderChat({ modelParametersB: 0.5 });
      const s = await view;

      await userEvent.press(s.getByLabelText('Fix grammar mode'));

      expect(s.queryByText(/invent details/)).toBeNull();
    });

    it('drops the system prompt when switched back to plain chat', async () => {
      // The prompt is rebuilt each turn rather than stored in history, so
      // switching away must not leave a stale instruction behind.
      const generate = spyGenerate();
      const { view } = renderChat({
        generate: generate as ChatSession['generate'],
      });
      const s = await view;

      await userEvent.press(s.getByLabelText('Fix grammar mode'));
      await userEvent.type(s.getByPlaceholderText('Message'), 'one');
      await userEvent.press(s.getByText('Send'));

      await userEvent.press(s.getByLabelText('Chat mode'));
      await userEvent.type(s.getByPlaceholderText('Message'), 'two');
      await userEvent.press(s.getByText('Send'));

      const second = generate.mock.calls[1]![0];
      expect(second.messages.some((m) => m.role === 'system')).toBe(false);
    });
  });

  it('shows a failed reply rather than losing the turn', async () => {
    const generate = jest.fn(async () => {
      throw new Error('engine exploded');
    });
    const { view } = renderChat({
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    await userEvent.type(s.getByPlaceholderText('Message'), 'hi');
    await userEvent.press(s.getByText('Send'));

    expect(s.getByText(/could not be generated/)).toBeTruthy();
  });
});
