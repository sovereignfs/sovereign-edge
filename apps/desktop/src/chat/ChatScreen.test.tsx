import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'desktop-ui';
import { ChatScreen } from './ChatScreen';
import * as tauri from '../lib/tauri';
import type { ManagedModel } from '../lib/tauri';

vi.mock('../lib/tauri', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri');
  return {
    ...actual,
    activeModelId: vi.fn(),
    cancelGeneration: vi.fn(),
    connectorStatus: vi.fn(),
    generateChat: vi.fn(),
    listModels: vi.fn(),
    onGenerateToken: vi.fn(() => Promise.resolve(() => Promise.resolve())),
  };
});

const activeModelId = vi.mocked(tauri.activeModelId);
const connectorStatus = vi.mocked(tauri.connectorStatus);
const generateChat = vi.mocked(tauri.generateChat);
const listModels = vi.mocked(tauri.listModels);

function model(overrides: Partial<ManagedModel> = {}): ManagedModel {
  return {
    id: 'qwen2.5-0.5b',
    name: 'Qwen2.5 0.5B',
    url: 'https://example.org/model.gguf',
    sizeBytes: 500_000_000,
    parameters: '0.5B',
    parametersB: 0.5,
    summary: 'Small and fast.',
    installed: true,
    fit: {
      fit: 'comfortable',
      estimatedPeakBytes: 0,
      note: 'Fits comfortably.',
    },
    ...overrides,
  };
}

function renderScreen(onNavigate = vi.fn()) {
  render(
    <ThemeProvider>
      <ChatScreen onNavigate={onNavigate} />
    </ThemeProvider>,
  );
  return { onNavigate };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ChatScreen', () => {
  it('prompts to choose a model when none is active', async () => {
    listModels.mockResolvedValue([]);
    activeModelId.mockResolvedValue(null);
    connectorStatus.mockRejectedValue(new Error('unconfigured'));
    renderScreen();

    expect(
      await screen.findByText('Choose a model above to start.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Choose a model' }),
    ).toBeInTheDocument();
  });

  it('sends plain chat with connector_mode "off" when Search is not granted', async () => {
    listModels.mockResolvedValue([model()]);
    activeModelId.mockResolvedValue('qwen2.5-0.5b');
    connectorStatus.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: false,
    });
    generateChat.mockResolvedValue({ text: 'Hi there.', connector: null });
    renderScreen();

    const input = await screen.findByLabelText('Message');
    await userEvent.type(input, 'Hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(generateChat).toHaveBeenCalledWith(
        expect.objectContaining({ connector_mode: 'off' }),
      ),
    );
  });

  it('sends plain chat with connector_mode "auto" when Search is granted', async () => {
    listModels.mockResolvedValue([model()]);
    activeModelId.mockResolvedValue('qwen2.5-0.5b');
    connectorStatus.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: true,
    });
    generateChat.mockResolvedValue({ text: 'Found it.', connector: 'Search' });
    renderScreen();

    const input = await screen.findByLabelText('Message');
    await userEvent.type(input, 'What is the weather?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(generateChat).toHaveBeenCalledWith(
        expect.objectContaining({ connector_mode: 'auto' }),
      ),
    );
    expect(await screen.findByText('Found it.')).toBeInTheDocument();
  });

  it('forces connector_mode "required" in Search mode regardless of grant state', async () => {
    listModels.mockResolvedValue([model()]);
    activeModelId.mockResolvedValue('qwen2.5-0.5b');
    connectorStatus.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: false,
    });
    generateChat.mockResolvedValue({ text: 'Result.', connector: 'Search' });
    renderScreen();

    await userEvent.click(screen.getByRole('button', { name: 'Search mode' }));
    const input = await screen.findByLabelText('Message');
    await userEvent.type(input, 'weather today');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(generateChat).toHaveBeenCalledWith(
        expect.objectContaining({ connector_mode: 'required' }),
      ),
    );
  });

  it('sends transform modes (e.g. grammar) with connector_mode "off"', async () => {
    listModels.mockResolvedValue([model()]);
    activeModelId.mockResolvedValue('qwen2.5-0.5b');
    connectorStatus.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: true,
    });
    generateChat.mockResolvedValue({ text: 'Fixed.', connector: null });
    renderScreen();

    await userEvent.click(
      screen.getByRole('button', { name: 'Fix grammar mode' }),
    );
    const input = await screen.findByLabelText('Message');
    await userEvent.type(input, 'this have a error');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(generateChat).toHaveBeenCalledWith(
        expect.objectContaining({ connector_mode: 'off', temperature: 0.2 }),
      ),
    );
  });

  it('shows the small-model caution banner only in Draft mode below the threshold', async () => {
    listModels.mockResolvedValue([model({ parametersB: 0.5 })]);
    activeModelId.mockResolvedValue('qwen2.5-0.5b');
    connectorStatus.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: false,
    });
    renderScreen();

    await screen.findByLabelText('Message');
    expect(screen.queryByText(/small enough to invent details/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Draft mode' }));
    expect(
      await screen.findByText(/small enough to invent details/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Chat mode' }));
    expect(screen.queryByText(/small enough to invent details/)).toBeNull();
  });

  it('the model indicator navigates to Models', async () => {
    listModels.mockResolvedValue([model()]);
    activeModelId.mockResolvedValue('qwen2.5-0.5b');
    connectorStatus.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: false,
    });
    const { onNavigate } = renderScreen();

    await userEvent.click(
      await screen.findByRole('button', { name: /Model: Qwen2.5 0.5B/ }),
    );
    expect(onNavigate).toHaveBeenCalledWith('models');
  });

  it('the connector indicator navigates to Connectors', async () => {
    listModels.mockResolvedValue([model()]);
    activeModelId.mockResolvedValue('qwen2.5-0.5b');
    connectorStatus.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: true,
    });
    const { onNavigate } = renderScreen();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Search: On' }),
    );
    expect(onNavigate).toHaveBeenCalledWith('connectors');
  });
});
