import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ConnectorManifestTier1 } from '@sovereignfs/connector-sdk';
import { validateManifest } from '@sovereignfs/connector-sdk';

import { executeConnectorCall } from './execute';

/**
 * Proves the example connectors under examples/connectors/ (task 5.3) are
 * not just schema-valid JSON but actually run, unmodified, through the
 * app's real connector runtime — the review checklist both the plugin
 * template and the example-connectors task set for themselves. Mirrors
 * the Rust side's real-TCP-round-trip test
 * (apps/desktop/src-tauri/src/connectors/orchestration.rs).
 *
 * `isAllowed`/`openVault` are mocked, same as execute.test.ts, since grant
 * and credential persistence are exercised elsewhere (tasks 2.2, 2.4). The
 * HTTP layer is not mocked: this test opens a real loopback TCP listener
 * and lets the manifest's own `executeConnectorCall` path make a real
 * request against it.
 */

const mockIsAllowed = jest.fn();
const mockVaultRead = jest.fn();
jest.mock('../permissions', () => ({
  isAllowed: (...args: unknown[]) => mockIsAllowed(...args),
  openVault: () => ({ read: (...args: unknown[]) => mockVaultRead(...args) }),
}));

function loadExampleManifest(exampleDir: string): unknown {
  const manifestPath = path.resolve(
    __dirname,
    '../../../../../examples/connectors',
    exampleDir,
    'manifest.json',
  );
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

async function listenOnLoopback(
  server: http.Server,
): Promise<{ origin: string; close: () => Promise<void> }> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * `jest.setup.js` replaces `globalThis.fetch` with a throwing mock, to keep
 * an accidental network call from a test silent — deliberately, per task
 * 1.5. This test's network call is not accidental: it's a loopback request
 * to a server this same test just opened, standing in for `fetch` for
 * exactly that one real round trip using Node's own HTTP client, so the
 * request/response mapping under test is the manifest's real shape hitting
 * a real socket, not a hand-built fake Response object.
 */
function realLoopbackFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: init.method, headers: init.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 500;
          resolve({
            ok: status < 300,
            status,
            type: 'basic',
            headers: {
              get: (key: string) =>
                (res.headers[key.toLowerCase()] as string | undefined) ?? null,
            },
            text: async () => text,
          } as unknown as Response);
        });
      },
    );
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

describe('example connectors run unmodified through the real runtime', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    mockIsAllowed.mockReset().mockReturnValue(true);
    mockVaultRead.mockReset().mockResolvedValue('Bearer test-token-123');
    originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init: RequestInit) =>
      realLoopbackFetch(url, {
        method: init.method ?? 'GET',
        headers: init.headers as Record<string, string>,
        body: typeof init.body === 'string' ? init.body : undefined,
      })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('validates and executes the free, no-credential example (Open-Meteo)', async () => {
    const raw = loadExampleManifest('simple-rest-open-meteo');
    const validated = validateManifest(raw);
    expect(validated.valid).toBe(true);
    if (!validated.valid) return;
    const manifest = validated.manifest as ConnectorManifestTier1;

    const server = http.createServer((req, res) => {
      expect(req.url).toContain('/v1/forecast');
      expect(req.url).toContain('latitude=38.7');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ current: { temperature_2m: 21.4 } }));
    });
    const { origin, close } = await listenOnLoopback(server);

    const localManifest: ConnectorManifestTier1 = {
      ...manifest,
      request: { ...manifest.request, origin },
      permissions: {
        ...manifest.permissions,
        network: { origins: [origin] },
      },
    };

    const outcome = await executeConnectorCall(localManifest, {
      latitude: 38.7,
      longitude: -9.1,
    });

    expect(outcome).toEqual({ ok: true, text: '21.4' });
    await close();
  });

  it('validates and executes the token-auth example (GitHub), proving the credential reaches the request header', async () => {
    const raw = loadExampleManifest('token-auth-github');
    const validated = validateManifest(raw);
    expect(validated.valid).toBe(true);
    if (!validated.valid) return;
    const manifest = validated.manifest as ConnectorManifestTier1;

    let receivedAuth: string | undefined;
    const server = http.createServer((req, res) => {
      receivedAuth = req.headers['authorization'] as string | undefined;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ login: 'octocat' }));
    });
    const { origin, close } = await listenOnLoopback(server);

    const localManifest: ConnectorManifestTier1 = {
      ...manifest,
      request: { ...manifest.request, origin },
      permissions: {
        ...manifest.permissions,
        network: { origins: [origin] },
      },
    };

    const outcome = await executeConnectorCall(localManifest, {});

    expect(outcome).toEqual({ ok: true, text: 'octocat' });
    expect(receivedAuth).toBe('Bearer test-token-123');
    await close();
  });
});
