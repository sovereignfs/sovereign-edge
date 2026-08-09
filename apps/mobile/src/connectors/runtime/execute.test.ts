import type {
  ConnectorManifestTier1,
  ConnectorManifestTier3,
} from '@sovereignfs/connector-sdk';
import deviceInfoManifest from '@sovereignfs/connector-sdk/src/fixtures/device-info.manifest.json';
import searchManifest from '@sovereignfs/connector-sdk/src/fixtures/search.manifest.json';
import { executeConnectorCall } from './execute';

/**
 * `isAllowed`, `isConnectorUsable`, and `openVault` read from on-disk/
 * keychain state (tasks 2.1–2.2, 6.1); mocked here so the request/response
 * mapping under test isn't entangled with permission, entitlement, or
 * credential persistence.
 */
const mockIsAllowed = jest.fn();
const mockIsConnectorUsable = jest.fn();
const mockVaultRead = jest.fn();
jest.mock('../permissions', () => ({
  isAllowed: (...args: unknown[]) => mockIsAllowed(...args),
  isConnectorUsable: (...args: unknown[]) => mockIsConnectorUsable(...args),
  openVault: () => ({ read: (...args: unknown[]) => mockVaultRead(...args) }),
}));

jest.mock('expo-device', () => ({
  modelName: 'Pixel 9',
  osName: 'Android',
  osVersion: '15',
}));

const search = searchManifest as ConnectorManifestTier1;
const deviceInfo = deviceInfoManifest as ConnectorManifestTier3;

const postManifest: ConnectorManifestTier1 = {
  ...search,
  id: 'fs.sovereign.post-fixture',
  request: {
    method: 'POST',
    origin: 'https://api.example.org',
    path: [{ literal: 'submit' }],
    body: {
      query: { slot: 'query' },
      note: { slot: 'note' },
    },
  },
  response: { textFrom: 'ok', maxBytes: 1000 },
};

function fakeResponse(opts: {
  ok?: boolean;
  status?: number;
  type?: string;
  headers?: Record<string, string>;
  text: string;
}) {
  const headers = opts.headers ?? {};
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    type: opts.type ?? 'basic',
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
    text: async () => opts.text,
  } as unknown as Response;
}

describe('executeConnectorCall', () => {
  beforeEach(() => {
    mockIsAllowed.mockReset().mockReturnValue(true);
    mockIsConnectorUsable.mockReset().mockReturnValue(true);
    mockVaultRead.mockReset().mockResolvedValue('secret-token');
    (globalThis.fetch as jest.Mock) = jest.fn();
  });

  it('refuses to run an unentitled paid connector without touching the network', async () => {
    mockIsConnectorUsable.mockReturnValue(false);
    const result = await executeConnectorCall(search, { query: 'chili' });
    expect(result).toEqual({ ok: false, reason: 'not-entitled' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refuses to run an unpermitted connector without touching the network', async () => {
    mockIsAllowed.mockReturnValue(false);

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({ ok: false, reason: 'not-permitted' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('builds the request from the manifest template and returns mapped text', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({ text: JSON.stringify({ results: 'chili recipes' }) }),
    );

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({ ok: true, text: 'chili recipes' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://searx.example.org/search?q=chili&format=json',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'secret-token' },
        redirect: 'manual',
      }),
    );
  });

  it('omits a query key when its slot has no matching argument', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({ text: JSON.stringify({ results: 'x' }) }),
    );

    await executeConnectorCall(search, { query: 'chili' });

    const [url] = (globalThis.fetch as jest.Mock).mock.calls[0] as [string];
    expect(url).not.toContain('language');
  });

  it('reports missing-credential rather than sending a blank header', async () => {
    mockVaultRead.mockResolvedValue(null);

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({
      ok: false,
      reason: 'missing-credential',
      detail: 'apiToken',
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('reports invalid-arguments when a required path slot is unfilled', async () => {
    const manifest: ConnectorManifestTier1 = {
      ...search,
      request: {
        method: 'GET',
        origin: search.request.origin,
        path: [{ slot: 'query' }],
      },
    };

    const result = await executeConnectorCall(manifest, {});

    expect(result).toEqual({ ok: false, reason: 'invalid-arguments' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sends a JSON body and sets Content-Type automatically', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({ text: JSON.stringify({ ok: 'submitted' }) }),
    );

    const result = await executeConnectorCall(postManifest, {
      query: 'chili',
    });

    expect(result).toEqual({ ok: true, text: 'submitted' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.org/submit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'chili' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('never follows a redirect', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({ status: 0, type: 'opaqueredirect', text: '' }),
    );

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({ ok: false, reason: 'redirected' });
  });

  it('treats a 3xx status as a redirect even without an opaque type', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({ ok: false, status: 302, text: '' }),
    );

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({ ok: false, reason: 'redirected' });
  });

  it('reports http-error on a non-2xx response', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({ ok: false, status: 500, text: '' }),
    );

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({
      ok: false,
      reason: 'http-error',
      detail: '500',
    });
  });

  it('rejects a response over maxBytes by declared Content-Length', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({
        headers: { 'content-length': String(search.response.maxBytes + 1) },
        text: JSON.stringify({ results: 'x' }),
      }),
    );

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({ ok: false, reason: 'response-too-large' });
  });

  it('rejects an oversized body even when Content-Length under-reports it', async () => {
    const big = 'x'.repeat(search.response.maxBytes + 1);
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({
        headers: { 'content-length': '1' },
        text: JSON.stringify({ results: big }),
      }),
    );

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({ ok: false, reason: 'response-too-large' });
  });

  it('reports malformed-response on invalid JSON', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({ text: 'not json' }),
    );

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({ ok: false, reason: 'malformed-response' });
  });

  it('reports malformed-response when textFrom resolves to nothing', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({ text: JSON.stringify({ somethingElse: 'x' }) }),
    );

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({ ok: false, reason: 'malformed-response' });
  });

  it('reports network-error rather than throwing when fetch rejects', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

    const result = await executeConnectorCall(search, { query: 'chili' });

    expect(result).toEqual({
      ok: false,
      reason: 'network-error',
      detail: 'offline',
    });
  });
});

describe('executeConnectorCall — Tier 3 (task 2.6)', () => {
  beforeEach(() => {
    mockIsAllowed.mockReset().mockReturnValue(true);
    (globalThis.fetch as jest.Mock) = jest.fn();
  });

  it('runs the registered native handler for a permitted capability, no HTTP involved', async () => {
    const result = await executeConnectorCall(deviceInfo, {});

    expect(result).toEqual({ ok: true, text: 'Pixel 9 Android (15)' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refuses to run an unpermitted Tier 3 connector, the same as Tier 1', async () => {
    mockIsAllowed.mockReturnValue(false);

    const result = await executeConnectorCall(deviceInfo, {});

    expect(result).toEqual({ ok: false, reason: 'not-permitted' });
  });

  it('reports handler-error for a capability with no registered handler', async () => {
    const unregistered: ConnectorManifestTier3 = {
      ...deviceInfo,
      handler: { capability: 'calendar.write' },
      permissions: { device: { capabilities: ['calendar.write'] } },
    };

    const result = await executeConnectorCall(unregistered, {});

    expect(result).toMatchObject({ ok: false, reason: 'handler-error' });
  });
});
