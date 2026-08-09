import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'desktop-ui';
import { ConnectorStoreScreen } from './ConnectorStoreScreen';
import * as tauri from '../lib/tauri';
import type { RegistryConnectorDto } from '../lib/tauri';

vi.mock('../lib/tauri', async () => {
  const actual =
    await vi.importActual<typeof import('../lib/tauri')>('../lib/tauri');
  return {
    ...actual,
    fetchConnectorRegistry: vi.fn(),
    installConnector: vi.fn(),
  };
});

const fetchConnectorRegistry = vi.mocked(tauri.fetchConnectorRegistry);
const installConnector = vi.mocked(tauri.installConnector);

function entry(
  overrides: Partial<RegistryConnectorDto['manifest']> = {},
): RegistryConnectorDto {
  return {
    id: 'fs.sovereign.weather-open-meteo',
    submittedByName: 'kasunben',
    manifest: {
      manifestVersion: 1,
      id: 'fs.sovereign.weather-open-meteo',
      name: 'Open-Meteo Forecast',
      version: '1.0.0',
      summary: 'Current temperature for a location.',
      tier: 1,
      platforms: ['desktop'],
      tool: {
        name: 'x',
        description: 'x',
        parameters: { type: 'object', properties: {} },
      },
      permissions: { network: { origins: ['https://api.open-meteo.com'] } },
      request: {
        method: 'GET',
        origin: 'https://api.open-meteo.com',
        path: [],
      },
      response: { textFrom: 'x', maxBytes: 1000 },
      pricing: { model: 'free' },
      ...overrides,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

function renderScreen(onNavigate = vi.fn()) {
  render(
    <ThemeProvider>
      <ConnectorStoreScreen onNavigate={onNavigate} />
    </ThemeProvider>,
  );
  return { onNavigate };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConnectorStoreScreen', () => {
  it('eventually shows the fetched connectors', async () => {
    fetchConnectorRegistry.mockResolvedValue([entry()]);
    renderScreen();

    expect(await screen.findByText('Open-Meteo Forecast')).toBeInTheDocument();
  });

  it('shows a readable error rather than crashing on a network failure', async () => {
    fetchConnectorRegistry.mockRejectedValue(
      new Error('getaddrinfo ENOTFOUND'),
    );
    renderScreen();

    expect(
      await screen.findByText(/getaddrinfo ENOTFOUND/),
    ).toBeInTheDocument();
  });

  it('shows an empty state when the registry has no listings', async () => {
    fetchConnectorRegistry.mockResolvedValue([]);
    renderScreen();

    expect(
      await screen.findByText('The registry has no listings right now.'),
    ).toBeInTheDocument();
  });

  it('filters out entries that do not declare the desktop platform', async () => {
    fetchConnectorRegistry.mockResolvedValue([
      entry({ platforms: ['ios', 'android'] }),
    ]);
    renderScreen();

    expect(
      await screen.findByText('No connectors match this search.'),
    ).toBeInTheDocument();
  });

  it('a paid entry is shown disabled and does not select on click', async () => {
    fetchConnectorRegistry.mockResolvedValue([
      entry({ pricing: { model: 'paid', productId: 'x' } }),
    ]);
    renderScreen();

    expect(await screen.findByText(/not yet supported/)).toBeInTheDocument();
    // A disabled ListItem renders as a non-interactive div, not a button —
    // there's nothing to click that would open the install detail.
    expect(screen.queryByText('Submitted by kasunben')).not.toBeInTheDocument();
  });

  it('selecting a free connector opens the install detail and installs on confirm', async () => {
    fetchConnectorRegistry.mockResolvedValue([entry()]);
    installConnector.mockResolvedValue({
      id: 'fs.sovereign.weather-open-meteo',
      name: 'Open-Meteo Forecast',
      granted: true,
    });
    const { onNavigate } = renderScreen();

    const row = await screen.findByText('Open-Meteo Forecast');
    const button = row.closest('button');
    if (!button) throw new Error('connector row is not clickable');
    await userEvent.click(button);

    expect(
      await screen.findByText('Submitted by kasunben'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByText('Install & grant'));

    await waitFor(() =>
      expect(installConnector).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'fs.sovereign.weather-open-meteo' }),
        {},
      ),
    );
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('connectors'));
  });

  it('refuses to install a credential-required connector until the credential is entered', async () => {
    fetchConnectorRegistry.mockResolvedValue([
      entry({
        id: 'fs.sovereign.github-whoami',
        name: 'GitHub Who Am I',
        permissions: {
          network: { origins: ['https://api.github.com'] },
          credentials: [{ key: 'authHeader', label: 'GitHub token' }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      }),
    ]);
    renderScreen();

    const row = await screen.findByText('GitHub Who Am I');
    const button = row.closest('button');
    if (!button) throw new Error('connector row is not clickable');
    await userEvent.click(button);

    await userEvent.click(await screen.findByText('Install & grant'));

    expect(await screen.findByText('Enter GitHub token.')).toBeInTheDocument();
    expect(installConnector).not.toHaveBeenCalled();
  });
});
