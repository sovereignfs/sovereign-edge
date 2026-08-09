import { render, userEvent } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';

import { ConnectorStoreScreen } from './ConnectorStoreScreen';

const mockFetchConnectorRegistry = jest.fn();
jest.mock('@/connectors/store/registry', () => ({
  fetchConnectorRegistry: () => mockFetchConnectorRegistry(),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

function entry(overrides: Record<string, unknown> = {}) {
  // A real registry entry always has `entry.id === entry.manifest.id`
  // (enforced by `registry/validate.mjs`) — deriving the top-level `id`
  // from `overrides.id` here keeps that true for fixtures too, instead of
  // silently leaving two entries sharing the same top-level `id` (which
  // React then rightly complains about as a duplicate list key).
  const id = (overrides.id as string | undefined) ?? 'fs.sovereign.weather-open-meteo';
  return {
    id,
    submittedBy: { name: 'kasunben' },
    manifest: {
      manifestVersion: 1,
      id,
      name: 'Open-Meteo Forecast',
      version: '1.0.0',
      summary: 'Current temperature for a location.',
      tier: 1,
      platforms: ['ios', 'android'],
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
    },
  };
}

function renderScreen() {
  return render(
    <ThemeProvider initialPreference="light">
      <ConnectorStoreScreen />
    </ThemeProvider>,
  );
}

describe('ConnectorStoreScreen', () => {
  beforeEach(() => {
    mockFetchConnectorRegistry.mockReset().mockResolvedValue({
      ok: true,
      connectors: [],
    });
    mockNavigate.mockReset();
  });

  it('eventually shows the fetched connectors', async () => {
    mockFetchConnectorRegistry.mockResolvedValue({
      ok: true,
      connectors: [entry()],
    });
    const s = await renderScreen();
    expect(await s.findByText('Open-Meteo Forecast')).toBeTruthy();
  });

  it('shows a readable error rather than crashing on a network failure', async () => {
    mockFetchConnectorRegistry.mockResolvedValue({
      ok: false,
      error: { kind: 'network', detail: 'getaddrinfo ENOTFOUND' },
    });
    const s = await renderScreen();
    expect(await s.findByText(/Could not reach the registry/)).toBeTruthy();
  });

  it('shows an empty state when the registry has no listings', async () => {
    mockFetchConnectorRegistry.mockResolvedValue({ ok: true, connectors: [] });
    const s = await renderScreen();
    expect(
      await s.findByText('The registry has no listings right now.'),
    ).toBeTruthy();
  });

  it('filters out entries that do not declare the current platform', async () => {
    mockFetchConnectorRegistry.mockResolvedValue({
      ok: true,
      connectors: [entry({ platforms: ['desktop'] })],
    });
    const s = await renderScreen();
    // The registry itself has an entry (state.connectors.length > 0), so
    // this is "nothing matches" rather than "no listings" — the platform
    // filter runs after that distinction is made.
    expect(await s.findByText('No connectors match this search.')).toBeTruthy();
  });

  it('filters out Tier 3 entries — nothing in the store can make them work', async () => {
    mockFetchConnectorRegistry.mockResolvedValue({
      ok: true,
      connectors: [entry({ tier: 3 })],
    });
    const s = await renderScreen();
    expect(await s.findByText('No connectors match this search.')).toBeTruthy();
  });

  it('search filters by name and summary', async () => {
    mockFetchConnectorRegistry.mockResolvedValue({
      ok: true,
      connectors: [
        entry(),
        entry({
          id: 'fs.sovereign.other',
          name: 'Other Thing',
          summary: 'unrelated',
        }),
      ],
    });
    const s = await renderScreen();
    await s.findByText('Open-Meteo Forecast');
    await userEvent.type(s.getByLabelText('Search'), 'meteo');
    expect(s.getByText('Open-Meteo Forecast')).toBeTruthy();
    expect(s.queryByText('Other Thing')).toBeNull();
  });

  it('navigates to install with the manifest and submitter on tap', async () => {
    mockFetchConnectorRegistry.mockResolvedValue({
      ok: true,
      connectors: [entry()],
    });
    const s = await renderScreen();
    await userEvent.press(await s.findByText('Open-Meteo Forecast'));
    expect(mockNavigate).toHaveBeenCalledWith(
      'ConnectorInstall',
      expect.objectContaining({
        manifest: expect.objectContaining({
          id: 'fs.sovereign.weather-open-meteo',
        }),
        submittedBy: { name: 'kasunben' },
      }),
    );
  });

  it('a paid entry is shown disabled and does not navigate on tap', async () => {
    mockFetchConnectorRegistry.mockResolvedValue({
      ok: true,
      connectors: [entry({ pricing: { model: 'paid', productId: 'x' } })],
    });
    const s = await renderScreen();
    expect(await s.findByText(/not yet supported/)).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
