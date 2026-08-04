import { render, userEvent } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';

import { SearchSetupScreen } from './SearchSetupScreen';

/**
 * `validateManifest` runs for real — a bad URL should be rejected by the
 * actual validator, not a test double pretending to agree with it.
 * `grant`/`openVault` are mocked so a save doesn't touch the real
 * keychain/permission store; `jest.requireActual` keeps everything else in
 * `@/connectors` genuine.
 */
const mockGrant = jest.fn();
const mockVaultWrite = jest.fn();
jest.mock('@/connectors', () => ({
  ...jest.requireActual('@/connectors'),
  grant: (...args: unknown[]) => mockGrant(...args),
  openVault: () => ({
    write: (...args: unknown[]) => mockVaultWrite(...args),
  }),
}));

const mockWriteSearchConfig = jest.fn();
jest.mock('@/connectors/search/config', () => ({
  writeSearchConfig: (...args: unknown[]) => mockWriteSearchConfig(...args),
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

function renderScreen() {
  return render(
    <ThemeProvider initialPreference="light">
      <SearchSetupScreen />
    </ThemeProvider>,
  );
}

describe('SearchSetupScreen', () => {
  beforeEach(() => {
    mockGrant.mockReset();
    mockVaultWrite.mockReset();
    mockWriteSearchConfig.mockReset();
    mockGoBack.mockReset();
  });

  it('defaults to SearXNG, asking for an instance URL', async () => {
    const s = await renderScreen();
    expect(s.getByLabelText('Instance URL')).toBeTruthy();
  });

  it('switches to asking for a Tavily API key', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Tavily'));
    expect(s.getByLabelText('Tavily API key')).toBeTruthy();
  });

  it('rejects an empty SearXNG URL without granting anything', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Save & enable'));

    expect(await s.findByText(/Invalid URL/)).toBeTruthy();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('rejects a cleartext SearXNG URL, naming why', async () => {
    const s = await renderScreen();
    await userEvent.type(
      s.getByLabelText('Instance URL'),
      'http://searx.example.org',
    );
    await userEvent.press(s.getByText('Save & enable'));

    expect(await s.findByText(/https/)).toBeTruthy();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('saves a valid SearXNG configuration and grants access', async () => {
    const s = await renderScreen();
    await userEvent.type(
      s.getByLabelText('Instance URL'),
      'https://searx.example.org',
    );
    await userEvent.press(s.getByText('Save & enable'));

    await s.findByText('Save & enable');
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
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('rejects an empty Tavily key without granting anything', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Tavily'));
    await userEvent.press(s.getByText('Save & enable'));

    expect(await s.findByText('Enter your Tavily API key.')).toBeTruthy();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('saves a Tavily key with the Bearer prefix and grants access', async () => {
    const s = await renderScreen();
    await userEvent.press(s.getByText('Tavily'));
    await userEvent.type(s.getByLabelText('Tavily API key'), 'tvly-abc123');
    await userEvent.press(s.getByText('Save & enable'));

    await s.findByText('Save & enable');
    expect(mockVaultWrite).toHaveBeenCalledWith('apiKey', 'Bearer tvly-abc123');
    expect(mockWriteSearchConfig).toHaveBeenCalledWith({ provider: 'tavily' });
    expect(mockGrant).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fs.sovereign.search' }),
    );
    expect(mockGoBack).toHaveBeenCalled();
  });
});
