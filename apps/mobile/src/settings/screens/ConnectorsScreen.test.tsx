import { render, userEvent } from '@testing-library/react-native';

import type { ConnectorManifestTier1 } from '@sovereignfs/connector-sdk';
import searchManifest from '@sovereignfs/connector-sdk/src/fixtures/search.manifest.json';

import { ThemeProvider } from '@/design-system';

import { ConnectorsScreen } from './ConnectorsScreen';

/**
 * `connectorScope` runs for real (a pure function over a manifest);
 * `grant`/`revoke`/`grantFor`/`needsRedecision` are mocked so this test
 * exercises the screen's own rendering/wiring, not the on-disk grant store
 * (already covered by `permissions/grants.test.ts`).
 */
const mockGrant = jest.fn();
const mockRevoke = jest.fn();
const mockGrantFor = jest.fn();
const mockNeedsRedecision = jest.fn();
const mockEnsureCalendarAccess = jest.fn();
jest.mock('@/connectors', () => ({
  ...jest.requireActual('@/connectors'),
  grant: (...args: unknown[]) => mockGrant(...args),
  revoke: (...args: unknown[]) => mockRevoke(...args),
  grantFor: (...args: unknown[]) => mockGrantFor(...args),
  needsRedecision: (...args: unknown[]) => mockNeedsRedecision(...args),
  ensureCalendarAccess: () => mockEnsureCalendarAccess(),
}));

const mockReadSearchConfig = jest.fn();
jest.mock('@/connectors/search/config', () => ({
  readSearchConfig: () => mockReadSearchConfig(),
}));

const mockReadInstalledConnectors = jest.fn();
const mockRemoveInstalledConnector = jest.fn();
jest.mock('@/connectors/store/installed', () => ({
  readInstalledConnectors: () => mockReadInstalledConnectors(),
  removeInstalledConnector: (...args: unknown[]) =>
    mockRemoveInstalledConnector(...args),
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
    mockGrant.mockReset();
    mockRevoke.mockReset().mockResolvedValue(undefined);
    mockGrantFor.mockReset().mockReturnValue({ state: 'not-asked' });
    mockNeedsRedecision.mockReset().mockReturnValue(false);
    mockReadSearchConfig.mockReset().mockReturnValue(null);
    mockReadInstalledConnectors.mockReset().mockReturnValue([]);
    mockRemoveInstalledConnector.mockReset();
    mockNavigate.mockReset();
    mockEnsureCalendarAccess.mockReset();
  });

  it('shows the Search setup row and the store entry point when nothing is installed', async () => {
    const s = await renderScreen();
    expect(s.getByText('Search')).toBeTruthy();
    expect(s.getByText('Not set up — tap to choose a provider')).toBeTruthy();
    expect(s.getByText('Connector Store')).toBeTruthy();
  });

  it('navigates to the store from the entry point row', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Connector Store'));
    expect(mockNavigate).toHaveBeenCalledWith('ConnectorStore');
  });

  it('lists a store-installed connector alongside its own remove row', async () => {
    mockReadInstalledConnectors.mockReturnValue([storeConnector]);
    const s = await renderScreen();
    expect(s.getByText('Open-Meteo Forecast')).toBeTruthy();
    expect(s.getByText('Uninstall Open-Meteo Forecast')).toBeTruthy();
  });

  it('grants a not-asked store connector on tap', async () => {
    mockReadInstalledConnectors.mockReturnValue([storeConnector]);
    const s = await renderScreen();
    await userEvent.press(s.getByText('Open-Meteo Forecast'));
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.weather-open-meteo' }),
    );
  });

  it('revokes a granted store connector on tap', async () => {
    mockGrantFor.mockReturnValue({ state: 'granted' });
    mockReadInstalledConnectors.mockReturnValue([storeConnector]);
    const s = await renderScreen();
    await userEvent.press(s.getByText('Open-Meteo Forecast'));
    expect(mockRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.weather-open-meteo' }),
    );
  });

  it('removing a store connector revokes it and deletes it from the installed list', async () => {
    mockReadInstalledConnectors.mockReturnValue([storeConnector]);
    const s = await renderScreen();
    await userEvent.press(s.getByText('Uninstall Open-Meteo Forecast'));
    expect(mockRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.weather-open-meteo' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRemoveInstalledConnector).toHaveBeenCalledWith(
      'fs.sovereign.weather-open-meteo',
    );
  });

  it('shows the configured Search connector alongside the reconfigure row', async () => {
    mockReadSearchConfig.mockReturnValue({
      provider: 'searxng',
      searxngUrl: 'https://searx.example.org',
    });
    const s = await renderScreen();
    expect(s.getByText('Search (SearXNG)')).toBeTruthy();
    expect(s.getByText('Reconfigure Search')).toBeTruthy();
  });

  describe('Calendar (task 10.1)', () => {
    it('always shows all four calendar rows, unconfigured', async () => {
      const s = await renderScreen();
      expect(s.getByText('Calendar — Create Event')).toBeTruthy();
      expect(s.getByText('Calendar — Update Event')).toBeTruthy();
      expect(s.getByText('Calendar — Delete Event')).toBeTruthy();
      expect(s.getByText('Calendar — Query Events')).toBeTruthy();
    });

    it('requests real OS calendar access before granting, and grants on success', async () => {
      mockEnsureCalendarAccess.mockResolvedValue({ granted: true });
      const s = await renderScreen();
      await userEvent.press(s.getByText('Calendar — Create Event'));
      expect(mockEnsureCalendarAccess).toHaveBeenCalled();
      expect(mockGrant).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'fs.sovereign.calendar.create-event' }),
      );
    });

    it('does not grant, and shows a message, when the OS refuses calendar access', async () => {
      mockEnsureCalendarAccess.mockResolvedValue({ granted: false });
      const s = await renderScreen();
      await userEvent.press(s.getByText('Calendar — Create Event'));
      expect(mockEnsureCalendarAccess).toHaveBeenCalled();
      expect(mockGrant).not.toHaveBeenCalled();
      expect(
        s.getByText(/Calendar access was not allowed/),
      ).toBeTruthy();
    });

    it('revoking a granted calendar connector does not request OS access again', async () => {
      mockGrantFor.mockReturnValue({ state: 'granted' });
      const s = await renderScreen();
      await userEvent.press(s.getByText('Calendar — Create Event'));
      expect(mockEnsureCalendarAccess).not.toHaveBeenCalled();
      expect(mockRevoke).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'fs.sovereign.calendar.create-event' }),
      );
    });
  });
});
