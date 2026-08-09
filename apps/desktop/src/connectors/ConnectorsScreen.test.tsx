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
    removeConnector: vi.fn(),
    requestCalendarAccess: vi.fn(),
  };
});

const listConnectors = vi.mocked(tauri.listConnectors);
const setConnectorGranted = vi.mocked(tauri.setConnectorGranted);
const removeConnector = vi.mocked(tauri.removeConnector);
const requestCalendarAccess = vi.mocked(tauri.requestCalendarAccess);

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

  it('the store entry point navigates to the connector store', async () => {
    listConnectors.mockResolvedValue([]);
    const { onNavigate } = renderScreen();

    const row = await screen.findByText('Connector Store');
    const button = row.closest('button');
    if (!button) throw new Error('store entry row is not clickable');
    await userEvent.click(button);

    expect(onNavigate).toHaveBeenCalledWith('connector-store');
  });

  it('shows a Remove row for a store-installed connector but not for Search', async () => {
    listConnectors.mockResolvedValue([
      { id: 'fs.sovereign.search', name: 'Search', granted: true },
      {
        id: 'fs.sovereign.weather-open-meteo',
        name: 'Open-Meteo Forecast',
        granted: true,
      },
    ]);
    renderScreen();

    await screen.findByText('Open-Meteo Forecast');
    expect(
      screen.getByText('Uninstall Open-Meteo Forecast'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Uninstall Search')).not.toBeInTheDocument();
  });

  it('removing a store-installed connector calls removeConnector and refreshes', async () => {
    listConnectors
      .mockResolvedValueOnce([
        {
          id: 'fs.sovereign.weather-open-meteo',
          name: 'Open-Meteo Forecast',
          granted: true,
        },
      ])
      .mockResolvedValueOnce([]);
    removeConnector.mockResolvedValue(undefined);
    renderScreen();

    const remove = await screen.findByText('Uninstall Open-Meteo Forecast');
    const button = remove.closest('button');
    if (!button) throw new Error('remove row is not clickable');
    await userEvent.click(button);

    await waitFor(() =>
      expect(removeConnector).toHaveBeenCalledWith(
        'fs.sovereign.weather-open-meteo',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('Open-Meteo Forecast')).not.toBeInTheDocument(),
    );
  });

  describe('Calendar (task 10.2)', () => {
    it('requests real OS calendar access before granting, and grants on success', async () => {
      listConnectors.mockResolvedValue([
        {
          id: 'fs.sovereign.calendar.create-event',
          name: 'Calendar — Create Event',
          granted: false,
        },
      ]);
      requestCalendarAccess.mockResolvedValue(true);
      setConnectorGranted.mockResolvedValue({
        id: 'fs.sovereign.calendar.create-event',
        name: 'Calendar — Create Event',
        granted: true,
      });
      renderScreen();

      const toggle = await screen.findByRole('switch', {
        name: 'Calendar — Create Event',
      });
      await userEvent.click(toggle);

      await waitFor(() => expect(requestCalendarAccess).toHaveBeenCalled());
      await waitFor(() =>
        expect(setConnectorGranted).toHaveBeenCalledWith(
          'fs.sovereign.calendar.create-event',
          true,
        ),
      );
    });

    it('does not grant, and shows a message, when the OS refuses calendar access', async () => {
      listConnectors.mockResolvedValue([
        {
          id: 'fs.sovereign.calendar.create-event',
          name: 'Calendar — Create Event',
          granted: false,
        },
      ]);
      requestCalendarAccess.mockResolvedValue(false);
      renderScreen();

      const toggle = await screen.findByRole('switch', {
        name: 'Calendar — Create Event',
      });
      await userEvent.click(toggle);

      await waitFor(() => expect(requestCalendarAccess).toHaveBeenCalled());
      expect(setConnectorGranted).not.toHaveBeenCalled();
      expect(
        await screen.findByText(/Calendar access wasn't allowed/),
      ).toBeInTheDocument();
    });

    it('revoking a granted calendar connector does not request OS access again', async () => {
      listConnectors.mockResolvedValue([
        {
          id: 'fs.sovereign.calendar.create-event',
          name: 'Calendar — Create Event',
          granted: true,
        },
      ]);
      setConnectorGranted.mockResolvedValue({
        id: 'fs.sovereign.calendar.create-event',
        name: 'Calendar — Create Event',
        granted: false,
      });
      renderScreen();

      const toggle = await screen.findByRole('switch', {
        name: 'Calendar — Create Event',
      });
      await userEvent.click(toggle);

      await waitFor(() =>
        expect(setConnectorGranted).toHaveBeenCalledWith(
          'fs.sovereign.calendar.create-event',
          false,
        ),
      );
      expect(requestCalendarAccess).not.toHaveBeenCalled();
    });

    it('shows no Remove row for a calendar connector', async () => {
      listConnectors.mockResolvedValue([
        {
          id: 'fs.sovereign.calendar.create-event',
          name: 'Calendar — Create Event',
          granted: true,
        },
      ]);
      renderScreen();

      await screen.findByText('Calendar — Create Event');
      expect(
        screen.queryByText('Uninstall Calendar — Create Event'),
      ).not.toBeInTheDocument();
    });
  });
});
