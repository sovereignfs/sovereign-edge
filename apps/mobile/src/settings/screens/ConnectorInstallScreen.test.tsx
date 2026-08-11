import { render, userEvent } from '@testing-library/react-native';

import type {
  ConnectorManifestTier1,
  ConnectorManifestTier3,
} from '@sovereignfs/connector-sdk';
import searchManifest from '@sovereignfs/connector-sdk/src/fixtures/search.manifest.json';
import deviceInfoManifest from '@sovereignfs/connector-sdk/src/fixtures/device-info.manifest.json';

import { ThemeProvider } from '@/design-system';

import { ConnectorInstallScreen } from './ConnectorInstallScreen';

/**
 * `validateManifest` runs for real; `grant`/`openVault` are mocked so
 * install doesn't touch the real permission store/keychain, same as
 * `SearchSetupScreen.test.tsx`.
 */
const mockGrant = jest.fn();
const mockVaultWrite = jest.fn();
jest.mock('@/connectors', () => ({
  ...jest.requireActual('@/connectors'),
  grant: (...args: unknown[]) => mockGrant(...args),
  openVault: () => ({ write: (...args: unknown[]) => mockVaultWrite(...args) }),
}));

const mockSaveInstalledConnector = jest.fn();
jest.mock('@/connectors/store/installed', () => ({
  saveInstalledConnector: (...args: unknown[]) =>
    mockSaveInstalledConnector(...args),
}));

const mockReplace = jest.fn();
let mockRouteParams: unknown;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ replace: mockReplace }),
  useRoute: () => ({ params: mockRouteParams }),
}));

const openMeteoManifest: ConnectorManifestTier1 = {
  ...(searchManifest as ConnectorManifestTier1),
  id: 'fs.sovereign.weather-open-meteo',
  name: 'Open-Meteo Forecast',
  summary: 'Current temperature for a location.',
  tool: {
    name: 'current_temperature',
    description: 'Get the current temperature at a latitude.',
    parameters: {
      type: 'object',
      properties: { latitude: { type: 'number' } },
      required: ['latitude'],
    },
  },
  permissions: { network: { origins: ['https://api.open-meteo.com'] } },
  request: {
    method: 'GET',
    origin: 'https://api.open-meteo.com',
    path: [{ literal: 'v1' }, { literal: 'forecast' }],
    query: { latitude: { slot: 'latitude' } },
  },
};

const githubManifest: ConnectorManifestTier1 = {
  ...(searchManifest as ConnectorManifestTier1),
  id: 'fs.sovereign.github-whoami',
  name: 'GitHub Who Am I',
  permissions: {
    network: { origins: ['https://api.github.com'] },
    credentials: [{ key: 'authHeader', label: 'GitHub token' }],
  },
  request: {
    method: 'GET',
    origin: 'https://api.github.com',
    path: [{ literal: 'user' }],
    headers: { Authorization: { credential: 'authHeader' } },
  },
};

const deviceInfo = deviceInfoManifest as ConnectorManifestTier3;

function renderScreen() {
  return render(
    <ThemeProvider initialPreference="light">
      <ConnectorInstallScreen />
    </ThemeProvider>,
  );
}

describe('ConnectorInstallScreen', () => {
  beforeEach(() => {
    mockGrant.mockReset();
    mockVaultWrite.mockReset();
    mockSaveInstalledConnector.mockReset();
    mockReplace.mockReset();
  });

  it('installs a credential-free connector without prompting for anything', async () => {
    mockRouteParams = {
      manifest: openMeteoManifest,
      submittedBy: { name: 'kasunben' },
    };
    const s = await renderScreen();
    expect(s.getByText('Open-Meteo Forecast')).toBeTruthy();
    expect(s.getByText('Submitted by kasunben')).toBeTruthy();

    await userEvent.press(s.getByText('Install & grant'));

    expect(mockVaultWrite).not.toHaveBeenCalled();
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.weather-open-meteo' }),
    );
    expect(mockSaveInstalledConnector).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.weather-open-meteo' }),
    );
    expect(mockReplace).toHaveBeenCalledWith('ConnectorDetail', {
      kind: 'manifest',
      manifest: expect.objectContaining({
        id: 'fs.sovereign.weather-open-meteo',
      }),
      installed: true,
    });
  });

  it('refuses to install a credential-required connector until the credential is entered', async () => {
    mockRouteParams = {
      manifest: githubManifest,
      submittedBy: { name: 'kasunben' },
    };
    const s = await renderScreen();
    await userEvent.press(s.getByText('Install & grant'));

    expect(await s.findByText('Enter GitHub token.')).toBeTruthy();
    expect(mockGrant).not.toHaveBeenCalled();
    expect(mockVaultWrite).not.toHaveBeenCalled();
  });

  it('writes the credential to the vault before granting', async () => {
    mockRouteParams = {
      manifest: githubManifest,
      submittedBy: { name: 'kasunben' },
    };
    const s = await renderScreen();
    await userEvent.type(
      s.getByLabelText('GitHub token'),
      'Bearer ghp_placeholder',
    );
    await userEvent.press(s.getByText('Install & grant'));

    expect(mockVaultWrite).toHaveBeenCalledWith(
      'authHeader',
      'Bearer ghp_placeholder',
    );
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.github-whoami' }),
    );
    expect(mockReplace).toHaveBeenCalledWith('ConnectorDetail', {
      kind: 'manifest',
      manifest: expect.objectContaining({ id: 'fs.sovereign.github-whoami' }),
      installed: true,
    });
  });

  it('shows the declared device capability scope for a Tier 3 manifest', async () => {
    mockRouteParams = {
      manifest: deviceInfo,
      submittedBy: { name: 'kasunben' },
    };
    const s = await renderScreen();
    expect(s.getByText('Uses device capabilities')).toBeTruthy();
  });
});
