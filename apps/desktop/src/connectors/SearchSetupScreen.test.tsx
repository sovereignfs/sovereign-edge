import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'desktop-ui';
import { SearchSetupScreen } from './SearchSetupScreen';
import * as tauri from '../lib/tauri';

vi.mock('../lib/tauri', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri');
  return {
    ...actual,
    setSearchConnectorConfig: vi.fn(),
  };
});

const setSearchConnectorConfig = vi.mocked(tauri.setSearchConnectorConfig);

function renderScreen(onNavigate = vi.fn()) {
  render(
    <ThemeProvider>
      <SearchSetupScreen onNavigate={onNavigate} />
    </ThemeProvider>,
  );
  return { onNavigate };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('SearchSetupScreen', () => {
  it('starts on SearXNG with the Instance URL field, blank', () => {
    renderScreen();
    expect(screen.getByRole('radio', { name: 'SearXNG' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByLabelText('Instance URL')).toHaveValue('');
    expect(screen.queryByLabelText('Tavily API key')).toBeNull();
  });

  it('switches to the Tavily API key field on toggle, still blank', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('radio', { name: 'Tavily' }));

    expect(screen.getByRole('radio', { name: 'Tavily' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByLabelText('Tavily API key')).toHaveValue('');
    expect(screen.queryByLabelText('Instance URL')).toBeNull();
  });

  it('saves a SearXNG URL and navigates to Connectors on success', async () => {
    setSearchConnectorConfig.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: true,
    });
    const { onNavigate } = renderScreen();

    await userEvent.type(
      screen.getByLabelText('Instance URL'),
      'https://searx.example.net',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save & enable' }),
    );

    await waitFor(() =>
      expect(setSearchConnectorConfig).toHaveBeenCalledWith({
        provider: 'searxng',
        searxng_url: 'https://searx.example.net',
      }),
    );
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('connectors'));
  });

  it('saves a Tavily key with the tavily_key field, not searxng_url', async () => {
    setSearchConnectorConfig.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: true,
    });
    const { onNavigate } = renderScreen();

    await userEvent.click(screen.getByRole('radio', { name: 'Tavily' }));
    await userEvent.type(
      screen.getByLabelText('Tavily API key'),
      'tvly-abc123',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save & enable' }),
    );

    await waitFor(() =>
      expect(setSearchConnectorConfig).toHaveBeenCalledWith({
        provider: 'tavily',
        tavily_key: 'tvly-abc123',
      }),
    );
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('connectors'));
  });

  it('shows the real returned error text and does not navigate on failure', async () => {
    setSearchConnectorConfig.mockRejectedValue(
      new Error('Enter a valid https:// URL.'),
    );
    const { onNavigate } = renderScreen();

    await userEvent.type(
      screen.getByLabelText('Instance URL'),
      'http://not-https.example.org',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save & enable' }),
    );

    expect(
      await screen.findByText('Enter a valid https:// URL.'),
    ).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('the Cancel button navigates to Connectors without saving', async () => {
    const { onNavigate } = renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onNavigate).toHaveBeenCalledWith('connectors');
    expect(setSearchConnectorConfig).not.toHaveBeenCalled();
  });
});
