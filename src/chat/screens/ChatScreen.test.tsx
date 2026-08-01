import { render, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/design-system';

import type { GenerateResult } from '../inference';
import {
  ChatSessionContext,
  type ChatSession,
  type ChatSessionStatus,
} from '../session/ChatSessionContext';
import { ChatScreen } from './ChatScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const done: GenerateResult = {
  text: 'ok',
  stopReason: 'eos',
  tokensGenerated: 1,
  timeToFirstTokenMs: 10,
  tokensPerSecond: 10,
};

function renderChat(overrides: Partial<ChatSession> = {}) {
  const session: ChatSession = {
    status: 'ready' as ChatSessionStatus,
    modelName: 'Qwen2.5 0.5B Instruct',
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
      async (
        _messages: unknown,
        onToken: (t: string) => void,
      ): Promise<GenerateResult> => {
        onToken('Blue');
        onToken(', green');
        return done;
      },
    );
    const { view } = renderChat({
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    await userEvent.type(s.getByPlaceholderText('Message'), 'colours?');
    await userEvent.press(s.getByRole('button'));

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
    await userEvent.press(s.getByRole('button'));

    expect(generate).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hello' }],
      expect.any(Function),
      expect.any(AbortSignal),
    );
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

  it('shows a failed reply rather than losing the turn', async () => {
    const generate = jest.fn(async () => {
      throw new Error('engine exploded');
    });
    const { view } = renderChat({
      generate: generate as ChatSession['generate'],
    });
    const s = await view;

    await userEvent.type(s.getByPlaceholderText('Message'), 'hi');
    await userEvent.press(s.getByRole('button'));

    expect(s.getByText(/could not be generated/)).toBeTruthy();
  });
});
