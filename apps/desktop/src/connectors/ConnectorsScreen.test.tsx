import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'desktop-ui';
import { ConnectorsScreen } from './ConnectorsScreen';
import * as tauri from '../lib/tauri';

vi.mock('../lib/tauri', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri');
  return {
    ...actual,
    listConnectors: vi.fn(),
    setConnectorGranted: vi.fn(),
  };
});

const listConnectors = vi.mocked(tauri.listConnectors);
const setConnectorGranted = vi.mocked(tauri.setConnectorGranted);

function renderScreen(onNavigate = vi.fn()) {
  render(
    <ThemeProvider>
      <ConnectorsScreen onNavigate={onNavigate} />
    </ThemeProvider>,
  );
  return { onNavigate };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConnectorsScreen', () => {
  it('shows the "Not set up" row and navigates to setup on click when unconfigured', async () => {
    listConnectors.mockResolvedValue([]);
    const { onNavigate } = renderScreen();

    const row = await screen.findByText('Search');
    expect(
      screen.getByText('Not set up — tap to choose a provider'),
    ).toBeInTheDocument();

    const button = row.closest('button');
    if (!button) throw new Error('empty-state row is not clickable');
    await userEvent.click(button);

    expect(onNavigate).toHaveBeenCalledWith('connectors-setup');
  });

  it('renders a granted connector with a checked switch and a reconfigure row', async () => {
    listConnectors.mockResolvedValue([
      { id: 'fs.sovereign.search', name: 'Search', granted: true },
    ]);
    renderScreen();

    const toggle = await screen.findByRole('switch', { name: 'Search' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByText(
        'Granted — this connector may reach the network when used.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Change provider or key')).toBeInTheDocument();
  });

  it('revokes a granted connector on toggle click', async () => {
    listConnectors.mockResolvedValue([
      { id: 'fs.sovereign.search', name: 'Search', granted: true },
    ]);
    setConnectorGranted.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: false,
    });
    renderScreen();

    const toggle = await screen.findByRole('switch', { name: 'Search' });
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(setConnectorGranted).toHaveBeenCalledWith(
        'fs.sovereign.search',
        false,
      ),
    );
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'false'),
    );
  });

  it('reverts the optimistic flip when the grant/revoke call fails', async () => {
    listConnectors.mockResolvedValue([
      { id: 'fs.sovereign.search', name: 'Search', granted: false },
    ]);
    setConnectorGranted.mockRejectedValue(new Error('network error'));
    renderScreen();

    const toggle = await screen.findByRole('switch', { name: 'Search' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);

    // Reverts back to false after the rejected call settles, rather than
    // leaving the UI claiming a grant that never actually took.
    await waitFor(() =>
      expect(toggle).toHaveAttribute('aria-checked', 'false'),
    );
  });

  it('the reconfigure row also navigates to setup', async () => {
    listConnectors.mockResolvedValue([
      { id: 'fs.sovereign.search', name: 'Search', granted: true },
    ]);
    const { onNavigate } = renderScreen();

    const reconfigure = await screen.findByText('Change provider or key');
    const button = reconfigure.closest('button');
    if (!button) throw new Error('reconfigure row is not clickable');
    await userEvent.click(button);

    expect(onNavigate).toHaveBeenCalledWith('connectors-setup');
  });
});
