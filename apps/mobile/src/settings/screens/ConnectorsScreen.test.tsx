import { render, userEvent } from '@testing-library/react-native';

import type { ConnectorManifestTier1 } from '@sovereignfs/connector-sdk';
import searchManifest from '@sovereignfs/connector-sdk/src/fixtures/search.manifest.json';

import { ThemeProvider } from '@/design-system';

import { ConnectorsScreen } from './ConnectorsScreen';

/**
 * `connectorScope` runs for real (a pure function over a manifest);
 * `grantFor`/`needsRedecision` are mocked so this test exercises the
 * screen's own rendering/wiring, not the on-disk grant store (already
 * covered by `permissions/grants.test.ts`). Every row here only navigates —
 * the actual grant/revoke/configure behavior moved to
 * `ConnectorDetailScreen.test.tsx` (task 7.7).
 */
const mockGrantFor = jest.fn();
const mockNeedsRedecision = jest.fn();
jest.mock('@/connectors', () => ({
  ...jest.requireActual('@/connectors'),
  grantFor: (...args: unknown[]) => mockGrantFor(...args),
  needsRedecision: (...args: unknown[]) => mockNeedsRedecision(...args),
}));

const mockReadSearchConfig = jest.fn();
jest.mock('@/connectors/search/config', () => ({
  readSearchConfig: () => mockReadSearchConfig(),
}));

const mockReadInstalledConnectors = jest.fn();
jest.mock('@/connectors/store/installed', () => ({
  readInstalledConnectors: () => mockReadInstalledConnectors(),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const react = jest.requireActual('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useNavigation: () => ({ navigate: mockNavigate }),
    // The real `useFocusEffect` runs its callback as an effect (after
    // commit), not synchronously during render. Calling `refresh()`'s
    // `setState` synchronously during render — what a naive `cb()` mock
    // here would do — triggers React's "too many re-renders" loop.
    useFocusEffect: (cb: () => void) => react.useEffect(cb, [cb]),
  };
});

const search = searchManifest as ConnectorManifestTier1;
const storeConnector: ConnectorManifestTier1 = {
  ...search,
  id: 'fs.sovereign.weather-open-meteo',
  name: 'Open-Meteo Forecast',
};

function renderScreen() {
  return render(
    <ThemeProvider initialPreference="light">
      <ConnectorsScreen />
    </ThemeProvider>,
  );
}

describe('ConnectorsScreen', () => {
  beforeEach(() => {
    mockGrantFor.mockReset().mockReturnValue({ state: 'not-asked' });
    mockNeedsRedecision.mockReset().mockReturnValue(false);
    mockReadSearchConfig.mockReset().mockReturnValue(null);
    mockReadInstalledConnectors.mockReset().mockReturnValue([]);
    mockNavigate.mockReset();
  });

  it('shows the Search row and the store entry point when nothing is installed', async () => {
    const s = await renderScreen();
    expect(s.getByText('Search')).toBeTruthy();
    expect(s.getByText('Choose a provider to get started')).toBeTruthy();
    expect(s.getByText('Connector Store')).toBeTruthy();
  });

  it('navigates to Search detail from the Search row', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Search'));
    expect(mockNavigate).toHaveBeenCalledWith('ConnectorDetail', {
      kind: 'search',
    });
  });

  it('navigates to the store from the entry point row', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Connector Store'));
    expect(mockNavigate).toHaveBeenCalledWith('ConnectorStore');
  });

  it('lists a store-installed connector under Installed, with a pill and no inline actions', async () => {
    mockReadInstalledConnectors.mockReturnValue([storeConnector]);
    const s = await renderScreen();
    expect(s.getByText('INSTALLED')).toBeTruthy();
    expect(s.getByText('Open-Meteo Forecast')).toBeTruthy();
    expect(s.getAllByText('Not asked').length).toBeGreaterThan(0);
  });

  it('navigates to detail, flagged installed, for a store connector', async () => {
    mockReadInstalledConnectors.mockReturnValue([storeConnector]);
    const s = await renderScreen();
    await userEvent.press(s.getByText('Open-Meteo Forecast'));
    expect(mockNavigate).toHaveBeenCalledWith('ConnectorDetail', {
      kind: 'manifest',
      manifest: expect.objectContaining({
        id: 'fs.sovereign.weather-open-meteo',
      }),
      installed: true,
    });
  });

  it('shows the configured Search connector with an Allowed pill', async () => {
    mockGrantFor.mockReturnValue({ state: 'granted' });
    mockReadSearchConfig.mockReturnValue({
      provider: 'searxng',
      searxngUrl: 'https://searx.example.org',
    });
    const s = await renderScreen();
    expect(s.getByText('Search')).toBeTruthy();
    expect(s.getAllByText('Allowed').length).toBeGreaterThan(0);
  });

  it('shows a Needs review pill for a granted connector with widened scope', async () => {
    mockGrantFor.mockReturnValue({ state: 'granted' });
    mockNeedsRedecision.mockReturnValue(true);
    mockReadSearchConfig.mockReturnValue({ provider: 'tavily' });
    const s = await renderScreen();
    expect(s.getAllByText('Needs review').length).toBeGreaterThan(0);
  });

  describe('Calendar (task 10.1)', () => {
    it('always shows all four calendar rows, under their own section', async () => {
      const s = await renderScreen();
      expect(s.getByText('CALENDAR')).toBeTruthy();
      expect(s.getByText('Calendar — Create Event')).toBeTruthy();
      expect(s.getByText('Calendar — Update Event')).toBeTruthy();
      expect(s.getByText('Calendar — Delete Event')).toBeTruthy();
      expect(s.getByText('Calendar — Query Events')).toBeTruthy();
    });

    it('navigates to detail on tap, not installed', async () => {
      const s = await renderScreen();
      await userEvent.press(s.getByText('Calendar — Create Event'));
      expect(mockNavigate).toHaveBeenCalledWith('ConnectorDetail', {
        kind: 'manifest',
        manifest: expect.objectContaining({
          id: 'fs.sovereign.calendar.create-event',
        }),
        installed: false,
      });
    });
  });

  describe('Device (tasks 11.1/11.2)', () => {
    it('always shows the brightness and flashlight rows, under their own section', async () => {
      const s = await renderScreen();
      expect(s.getByText('DEVICE')).toBeTruthy();
      expect(s.getByText('Device — Brightness')).toBeTruthy();
      expect(s.getByText('Device — Flashlight')).toBeTruthy();
    });

    it('navigates to detail on tap', async () => {
      const s = await renderScreen();
      await userEvent.press(s.getByText('Device — Brightness'));
      expect(mockNavigate).toHaveBeenCalledWith('ConnectorDetail', {
        kind: 'manifest',
        manifest: expect.objectContaining({
          id: 'fs.sovereign.device.set-brightness',
        }),
        installed: false,
      });
    });
  });
});
