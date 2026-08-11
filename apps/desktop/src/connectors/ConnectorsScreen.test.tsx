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
    setSearchConnectorConfig: vi.fn(),
    removeConnector: vi.fn(),
    requestCalendarAccess: vi.fn(),
  };
});

const listConnectors = vi.mocked(tauri.listConnectors);
const setConnectorGranted = vi.mocked(tauri.setConnectorGranted);
const setSearchConnectorConfig = vi.mocked(tauri.setSearchConnectorConfig);
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

async function rowButton(titleSubstring: string): Promise<HTMLElement> {
  const title = await screen.findByText(new RegExp(titleSubstring));
  const button = title.closest('button');
  if (!button) throw new Error(`row for "${titleSubstring}" is not clickable`);
  return button;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConnectorsScreen', () => {
  it('shows the "Not set up" row and opens Search detail on click when unconfigured', async () => {
    listConnectors.mockResolvedValue([]);
    renderScreen();

    await userEvent.click(await rowButton('Search'));

    expect(screen.getByLabelText('Instance URL')).toBeInTheDocument();
    expect(screen.getByText('Not set up')).toBeInTheDocument();
  });

  it('shows Search under its own section with an Allowed pill once configured', async () => {
    listConnectors.mockResolvedValue([
      { id: 'fs.sovereign.search', name: 'Search', granted: true },
    ]);
    renderScreen();

    expect(await screen.findByText('SEARCH')).toBeInTheDocument();
    expect(screen.getByText('Allowed')).toBeInTheDocument();
  });

  it('opens Search detail on click, offering Revoke access and the reconfigure form', async () => {
    listConnectors.mockResolvedValue([
      { id: 'fs.sovereign.search', name: 'Search', granted: true },
    ]);
    renderScreen();

    await userEvent.click(await rowButton('Search'));

    expect(
      screen.getByRole('button', { name: 'Revoke access' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Instance URL')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument();
  });

  it('revokes Search from its own detail view', async () => {
    listConnectors.mockResolvedValue([
      { id: 'fs.sovereign.search', name: 'Search', granted: true },
    ]);
    setConnectorGranted.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: false,
    });
    renderScreen();

    await userEvent.click(await rowButton('Search'));
    await userEvent.click(
      screen.getByRole('button', { name: 'Revoke access' }),
    );

    await waitFor(() =>
      expect(setConnectorGranted).toHaveBeenCalledWith(
        'fs.sovereign.search',
        false,
      ),
    );
  });

  it('saves a new Search configuration from the first-run detail view', async () => {
    listConnectors.mockResolvedValue([]);
    setSearchConnectorConfig.mockResolvedValue({
      id: 'fs.sovereign.search',
      name: 'Search',
      granted: true,
    });
    renderScreen();

    await userEvent.click(await rowButton('Search'));
    await userEvent.type(
      screen.getByLabelText('Instance URL'),
      'https://searx.example.org',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Save & grant access' }),
    );

    await waitFor(() =>
      expect(setSearchConnectorConfig).toHaveBeenCalledWith({
        provider: 'searxng',
        searxng_url: 'https://searx.example.org',
      }),
    );
  });

  it('the store entry point navigates to the connector store', async () => {
    listConnectors.mockResolvedValue([]);
    const { onNavigate } = renderScreen();

    await userEvent.click(await rowButton('Connector Store'));

    expect(onNavigate).toHaveBeenCalledWith('connector-store');
  });

  it('lists a store-installed connector under Installed, with a pill and no inline Toggle', async () => {
    listConnectors.mockResolvedValue([
      { id: 'fs.sovereign.search', name: 'Search', granted: true },
      {
        id: 'fs.sovereign.weather-open-meteo',
        name: 'Open-Meteo Forecast',
        granted: true,
      },
    ]);
    renderScreen();

    expect(await screen.findByText('INSTALLED')).toBeInTheDocument();
    expect(screen.getByText('Open-Meteo Forecast')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('offers to remove a store-installed connector from its own detail view', async () => {
    listConnectors.mockResolvedValue([
      {
        id: 'fs.sovereign.weather-open-meteo',
        name: 'Open-Meteo Forecast',
        granted: true,
      },
    ]);
    removeConnector.mockResolvedValue(undefined);
    renderScreen();

    await userEvent.click(await rowButton('Open-Meteo Forecast'));
    expect(
      screen.queryByRole('button', { name: 'Remove connector' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove connector' }),
    );

    await waitFor(() =>
      expect(removeConnector).toHaveBeenCalledWith(
        'fs.sovereign.weather-open-meteo',
      ),
    );
  });

  it('a Calendar connector has no Remove action in its detail view', async () => {
    listConnectors.mockResolvedValue([
      {
        id: 'fs.sovereign.calendar.create-event',
        name: 'Calendar — Create Event',
        granted: true,
      },
    ]);
    renderScreen();

    await userEvent.click(await rowButton('Calendar — Create Event'));
    expect(
      screen.queryByRole('button', { name: 'Remove connector' }),
    ).not.toBeInTheDocument();
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

      await userEvent.click(await rowButton('Calendar — Create Event'));
      await userEvent.click(
        screen.getByRole('button', { name: 'Grant access' }),
      );

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

      await userEvent.click(await rowButton('Calendar — Create Event'));
      await userEvent.click(
        screen.getByRole('button', { name: 'Grant access' }),
      );

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

      await userEvent.click(await rowButton('Calendar — Create Event'));
      await userEvent.click(
        screen.getByRole('button', { name: 'Revoke access' }),
      );

      await waitFor(() =>
        expect(setConnectorGranted).toHaveBeenCalledWith(
          'fs.sovereign.calendar.create-event',
          false,
        ),
      );
      expect(requestCalendarAccess).not.toHaveBeenCalled();
    });
  });
});
