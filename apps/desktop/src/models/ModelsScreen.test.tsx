import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'desktop-ui';
import { ModelsScreen } from './ModelsScreen';
import * as tauri from '../lib/tauri';
import type { ManagedModel } from '../lib/tauri';

vi.mock('../lib/tauri', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri');
  return {
    ...actual,
    listModels: vi.fn(),
    activeModelId: vi.fn(),
    installModel: vi.fn(),
    cancelInstall: vi.fn(),
    loadModel: vi.fn(),
    removeModel: vi.fn(),
    onDownloadProgress: vi.fn(() => Promise.resolve(() => Promise.resolve())),
    onDownloadPhase: vi.fn(() => Promise.resolve(() => Promise.resolve())),
  };
});

const listModels = vi.mocked(tauri.listModels);
const activeModelId = vi.mocked(tauri.activeModelId);
const installModel = vi.mocked(tauri.installModel);
const cancelInstall = vi.mocked(tauri.cancelInstall);
const loadModel = vi.mocked(tauri.loadModel);
const removeModel = vi.mocked(tauri.removeModel);

function model(overrides: Partial<ManagedModel> = {}): ManagedModel {
  return {
    id: 'qwen2.5-0.5b',
    name: 'Qwen2.5 0.5B',
    url: 'https://example.org/model.gguf',
    sizeBytes: 500_000_000,
    parameters: '0.5B',
    parametersB: 0.5,
    summary: 'Small and fast.',
    installed: false,
    fit: {
      fit: 'comfortable',
      estimatedPeakBytes: 0,
      note: 'Fits comfortably.',
    },
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <ThemeProvider>
      <ModelsScreen />
    </ThemeProvider>,
  );
}

async function rowButton(titleSubstring: string): Promise<HTMLElement> {
  const title = await screen.findByText(new RegExp(titleSubstring));
  const button = title.closest('button');
  if (!button) throw new Error(`row for "${titleSubstring}" is not clickable`);
  return button;
}

beforeEach(() => {
  activeModelId.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ModelsScreen', () => {
  it('shows Download for an uninstalled model and installs it on click', async () => {
    listModels.mockResolvedValue([model()]);
    installModel.mockResolvedValue(undefined);
    renderScreen();

    expect(await screen.findByText('Download')).toBeInTheDocument();
    await userEvent.click(await rowButton('Qwen2.5 0.5B'));

    await waitFor(() =>
      expect(installModel).toHaveBeenCalledWith('qwen2.5-0.5b'),
    );
  });

  it('shows In use for the active model and removes it on click', async () => {
    listModels.mockResolvedValue([model({ installed: true })]);
    activeModelId.mockResolvedValue('qwen2.5-0.5b');
    removeModel.mockResolvedValue(undefined);
    renderScreen();

    expect(await screen.findByText('In use')).toBeInTheDocument();
    await userEvent.click(await rowButton('Qwen2.5 0.5B'));

    await waitFor(() =>
      expect(removeModel).toHaveBeenCalledWith('qwen2.5-0.5b'),
    );
  });

  it('shows Installed for a non-active installed model and activates it on click', async () => {
    listModels.mockResolvedValue([model({ installed: true })]);
    activeModelId.mockResolvedValue(null);
    loadModel.mockResolvedValue({
      gpu: false,
      contextSize: 4096,
      toolCapable: true,
    });
    renderScreen();

    expect(await screen.findByText('Installed')).toBeInTheDocument();
    await userEvent.click(await rowButton('Qwen2.5 0.5B'));

    await waitFor(() => expect(loadModel).toHaveBeenCalledWith('qwen2.5-0.5b'));
  });

  it('cancels a downloading row on click, dropping it back to idle', async () => {
    listModels.mockResolvedValue([model()]);
    let resolveInstall: () => void = () => {};
    installModel.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveInstall = resolve;
      }),
    );
    renderScreen();

    await userEvent.click(await rowButton('Qwen2.5 0.5B'));
    // No progress event has fired yet, so the fraction is unknown — the
    // badge shows the same placeholder the subtitle's own byte-count
    // fallback uses for an unknown total.
    expect(await screen.findByText('…')).toBeInTheDocument();

    await userEvent.click(await rowButton('Qwen2.5 0.5B'));
    expect(cancelInstall).toHaveBeenCalledWith('qwen2.5-0.5b');

    // The install() call itself resolves separately (a real cancel makes
    // it reject with a TauriCommandError, not resolve) — resolving it here
    // just lets this test's own promise settle cleanly.
    resolveInstall();
  });

  it('drops the row entirely (no failure shown) when install() rejects with a cancelled TauriCommandError', async () => {
    listModels.mockResolvedValue([model()]);
    const cancelledError = new tauri.TauriCommandError({
      kind: 'Model',
      error: {
        code: 'cancelled',
        modelId: 'qwen2.5-0.5b',
        message: 'Download was cancelled.',
      },
    });
    installModel.mockRejectedValue(cancelledError);
    renderScreen();

    await userEvent.click(await rowButton('Qwen2.5 0.5B'));

    await waitFor(() => expect(screen.queryByText('…')).toBeNull());
    expect(screen.queryByText(/could not be generated|failed/i)).toBeNull();
    expect(await screen.findByText('Download')).toBeInTheDocument();
  });

  it('shows Retry and the real error message when install() fails for a real reason', async () => {
    listModels.mockResolvedValue([model()]);
    installModel.mockRejectedValue(
      new Error('Download failed: server returned 500.'),
    );
    renderScreen();

    await userEvent.click(await rowButton('Qwen2.5 0.5B'));

    expect(await screen.findByText('Retry')).toBeInTheDocument();
    expect(
      await screen.findByText('Download failed: server returned 500.'),
    ).toBeInTheDocument();
  });

  it('groups installed and available models under their own section', async () => {
    listModels.mockResolvedValue([
      model({
        id: 'installed-model',
        name: 'Installed Model',
        installed: true,
      }),
      model({
        id: 'available-model',
        name: 'Available Model',
        installed: false,
      }),
    ]);
    activeModelId.mockResolvedValue('installed-model');
    renderScreen();

    expect(await screen.findByText('INSTALLED')).toBeInTheDocument();
    expect(screen.getByText('AVAILABLE')).toBeInTheDocument();
  });
});
