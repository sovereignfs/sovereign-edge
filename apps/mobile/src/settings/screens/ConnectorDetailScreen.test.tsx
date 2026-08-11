import { render, userEvent } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';

import { ConnectorDetailScreen } from './ConnectorDetailScreen';

/**
 * `connectorScope`/`validateManifest` run for real (pure functions over a
 * manifest); `grant`/`revoke`/`grantFor`/`needsRedecision` are mocked so
 * this exercises the screen's own wiring, not the on-disk grant store
 * (already covered by `permissions/grants.test.ts`).
 */
const mockGrant = jest.fn();
const mockRevoke = jest.fn();
const mockGrantFor = jest.fn();
const mockNeedsRedecision = jest.fn();
const mockEnsureCalendarAccess = jest.fn();
const mockEnsureCameraAccess = jest.fn();
const mockOpenVault = jest.fn();
const mockVaultWrite = jest.fn();
jest.mock('@/connectors', () => ({
  ...jest.requireActual('@/connectors'),
  grant: (...args: unknown[]) => mockGrant(...args),
  revoke: (...args: unknown[]) => mockRevoke(...args),
  grantFor: (...args: unknown[]) => mockGrantFor(...args),
  needsRedecision: (...args: unknown[]) => mockNeedsRedecision(...args),
  ensureCalendarAccess: () => mockEnsureCalendarAccess(),
  ensureCameraAccess: () => mockEnsureCameraAccess(),
  openVault: (...args: unknown[]) => mockOpenVault(...args),
}));

const mockReadSearchConfig = jest.fn();
jest.mock('@/connectors/search/config', () => ({
  readSearchConfig: () => mockReadSearchConfig(),
  writeSearchConfig: (...args: unknown[]) => mockWriteSearchConfig(...args),
}));
const mockWriteSearchConfig = jest.fn();

const mockRemoveInstalledConnector = jest.fn();
jest.mock('@/connectors/store/installed', () => ({
  removeInstalledConnector: (...args: unknown[]) =>
    mockRemoveInstalledConnector(...args),
}));

const mockNavigate = jest.fn();
let mockRouteParams: unknown;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: mockRouteParams }),
}));

function renderScreen() {
  return render(
    <ThemeProvider initialPreference="light">
      <ConnectorDetailScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockGrant.mockReset();
  mockRevoke.mockReset().mockResolvedValue(undefined);
  mockGrantFor.mockReset().mockReturnValue({ state: 'not-asked' });
  mockNeedsRedecision.mockReset().mockReturnValue(false);
  mockEnsureCalendarAccess.mockReset();
  mockEnsureCameraAccess.mockReset();
  mockOpenVault.mockReset().mockReturnValue({
    write: (...args: unknown[]) => mockVaultWrite(...args),
  });
  mockVaultWrite.mockReset();
  mockReadSearchConfig.mockReset().mockReturnValue(null);
  mockWriteSearchConfig.mockReset();
  mockRemoveInstalledConnector.mockReset();
  mockNavigate.mockReset();
});

describe('ConnectorDetailScreen — a built-in permission connector', () => {
  const CREATE_EVENT_ID = 'fs.sovereign.calendar.create-event';

  beforeEach(() => {
    mockRouteParams = {
      kind: 'manifest',
      manifest: {
        id: CREATE_EVENT_ID,
        name: 'Calendar — Create Event',
        summary: 'Creates an event on your device calendar.',
        tier: 3,
        permissions: { device: { capabilities: ['calendar.event.create'] } },
      },
      installed: false,
    };
  });

  it('requests real OS calendar access before granting, and grants on success', async () => {
    mockEnsureCalendarAccess.mockResolvedValue({ granted: true });
    const s = await renderScreen();
    await userEvent.press(s.getByText('Grant access'));
    expect(mockEnsureCalendarAccess).toHaveBeenCalled();
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: CREATE_EVENT_ID }),
    );
  });

  it('does not grant, and shows a message, when the OS refuses calendar access', async () => {
    mockEnsureCalendarAccess.mockResolvedValue({ granted: false });
    const s = await renderScreen();
    await userEvent.press(s.getByText('Grant access'));
    expect(mockGrant).not.toHaveBeenCalled();
    expect(s.getByText(/Calendar access was not allowed/)).toBeTruthy();
  });

  it('revoking a granted calendar connector does not request OS access again', async () => {
    mockGrantFor.mockReturnValue({ state: 'granted' });
    const s = await renderScreen();
    await userEvent.press(s.getByText('Revoke access'));
    expect(mockEnsureCalendarAccess).not.toHaveBeenCalled();
    expect(mockRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ id: CREATE_EVENT_ID }),
    );
  });

  it('has no remove-connector action for a built-in connector', async () => {
    const s = await renderScreen();
    expect(s.queryByText('Remove connector')).toBeNull();
  });
});

describe('ConnectorDetailScreen — device torch', () => {
  const TORCH_ID = 'fs.sovereign.device.set-torch';

  beforeEach(() => {
    mockRouteParams = {
      kind: 'manifest',
      manifest: {
        id: TORCH_ID,
        name: 'Device — Flashlight',
        summary: 'Turns this device’s flashlight on or off.',
        tier: 3,
        permissions: { device: { capabilities: ['device.torch'] } },
      },
      installed: false,
    };
  });

  it('requests real OS camera access before granting, and grants on success', async () => {
    mockEnsureCameraAccess.mockResolvedValue({ granted: true });
    const s = await renderScreen();
    await userEvent.press(s.getByText('Grant access'));
    expect(mockEnsureCameraAccess).toHaveBeenCalled();
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: TORCH_ID }),
    );
  });

  it('does not grant, and shows a message, when the OS refuses camera access', async () => {
    mockEnsureCameraAccess.mockResolvedValue({ granted: false });
    const s = await renderScreen();
    await userEvent.press(s.getByText('Grant access'));
    expect(mockGrant).not.toHaveBeenCalled();
    expect(s.getByText(/Camera access was not allowed/)).toBeTruthy();
  });
});

describe('ConnectorDetailScreen — device brightness', () => {
  beforeEach(() => {
    mockRouteParams = {
      kind: 'manifest',
      manifest: {
        id: 'fs.sovereign.device.set-brightness',
        name: 'Device — Brightness',
        summary: "Reads or sets this app's own screen brightness.",
        tier: 3,
        permissions: { device: { capabilities: ['device.brightness'] } },
      },
      installed: false,
    };
  });

  it('grants on tap with no OS permission step', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Grant access'));
    expect(mockEnsureCalendarAccess).not.toHaveBeenCalled();
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.device.set-brightness' }),
    );
  });
});

describe('ConnectorDetailScreen — a store-installed connector', () => {
  const WEATHER_ID = 'fs.sovereign.weather-open-meteo';

  beforeEach(() => {
    mockRouteParams = {
      kind: 'manifest',
      manifest: {
        id: WEATHER_ID,
        name: 'Open-Meteo Forecast',
        tier: 1,
        permissions: { network: { origins: ['https://api.open-meteo.com'] } },
      },
      installed: true,
    };
  });

  it('grants a not-asked store connector on tap', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Grant access'));
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: WEATHER_ID }),
    );
  });

  it('offers to remove the connector, revoking and deleting it from the installed list', async () => {
    mockGrantFor.mockReturnValue({ state: 'granted' });
    const s = await renderScreen();
    await userEvent.press(s.getByText('Remove connector'));
    expect(mockRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ id: WEATHER_ID }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRemoveInstalledConnector).toHaveBeenCalledWith(WEATHER_ID);
    expect(mockNavigate).toHaveBeenCalledWith('Connectors');
  });
});

describe('ConnectorDetailScreen — Search, not yet configured', () => {
  beforeEach(() => {
    mockRouteParams = { kind: 'search' };
  });

  it('defaults to SearXNG, asking for an instance URL', async () => {
    const s = await renderScreen();
    expect(s.getByText('Not set up')).toBeTruthy();
    expect(s.getByLabelText('Instance URL')).toBeTruthy();
  });

  it('switches to asking for a Tavily API key', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Tavily'));
    expect(s.getByLabelText('Tavily API key')).toBeTruthy();
  });

  it('rejects an empty SearXNG URL without granting anything', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Save & grant access'));
    expect(await s.findByText(/Invalid URL/)).toBeTruthy();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('rejects a cleartext SearXNG URL, naming why', async () => {
    const s = await renderScreen();
    await userEvent.type(
      s.getByLabelText('Instance URL'),
      'http://searx.example.org',
    );
    await userEvent.press(s.getByText('Save & grant access'));
    expect(await s.findByText(/https/)).toBeTruthy();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('saves a valid SearXNG configuration and grants access, staying on the screen', async () => {
    const s = await renderScreen();
    await userEvent.type(
      s.getByLabelText('Instance URL'),
      'https://searx.example.org',
    );
    await userEvent.press(s.getByText('Save & grant access'));

    await s.findByText('Save & grant access');
    expect(mockWriteSearchConfig).toHaveBeenCalledWith({
      provider: 'searxng',
      searxngUrl: 'https://searx.example.org',
    });
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          origin: 'https://searx.example.org',
        }),
      }),
    );
    expect(mockVaultWrite).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('rejects an empty Tavily key without granting anything', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Tavily'));
    await userEvent.press(s.getByText('Save & grant access'));
    expect(await s.findByText('Enter your Tavily API key.')).toBeTruthy();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('saves a Tavily key with the Bearer prefix and grants access', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Tavily'));
    await userEvent.type(s.getByLabelText('Tavily API key'), 'tvly-abc123');
    await userEvent.press(s.getByText('Save & grant access'));

    await s.findByText('Save & grant access');
    expect(mockVaultWrite).toHaveBeenCalledWith('apiKey', 'Bearer tvly-abc123');
    expect(mockWriteSearchConfig).toHaveBeenCalledWith({ provider: 'tavily' });
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.search' }),
    );
  });
});

describe('ConnectorDetailScreen — Search, already configured', () => {
  beforeEach(() => {
    mockReadSearchConfig.mockReturnValue({
      provider: 'searxng',
      searxngUrl: 'https://searx.example.org',
    });
    mockRouteParams = { kind: 'search' };
  });

  it('shows the current scope and provider, prefilling the instance URL', async () => {
    const s = await renderScreen();
    expect(s.getByText('https://searx.example.org')).toBeTruthy();
    expect(s.getByLabelText('Instance URL').props.value).toBe(
      'https://searx.example.org',
    );
    expect(s.getByText('Save changes')).toBeTruthy();
  });

  it('offers Revoke access once granted', async () => {
    mockGrantFor.mockReturnValue({ state: 'granted' });
    const s = await renderScreen();
    await userEvent.press(s.getByText('Revoke access'));
    expect(mockRevoke).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.search' }),
    );
  });

  it('does not require re-entering a Tavily key to keep the stored one', async () => {
    mockReadSearchConfig.mockReturnValue({ provider: 'tavily' });
    const s = await renderScreen();
    await userEvent.press(s.getByText('Save changes'));
    await s.findByText('Save changes');
    expect(mockVaultWrite).not.toHaveBeenCalled();
    expect(mockWriteSearchConfig).toHaveBeenCalledWith({ provider: 'tavily' });
    expect(mockGrant).toHaveBeenCalled();
  });
});
