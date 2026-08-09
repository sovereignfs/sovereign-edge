import { validateManifest } from '@sovereignfs/connector-sdk';
import {
  CONNECTOR_ID,
  TAVILY_MANIFEST,
  buildSearxngManifest,
} from './manifest';

/**
 * The point of both manifests, per task 2.1's own review checklist for the
 * schema: they validate with no special-casing, the same as any third-party
 * manifest would have to.
 */
describe('buildSearxngManifest', () => {
  it('produces a manifest that validates against a real https instance URL', () => {
    const manifest = buildSearxngManifest('https://searx.example.org');
    expect(validateManifest(manifest)).toMatchObject({ valid: true });
  });

  it('uses the given instance as both the request origin and the allowlisted origin', () => {
    const manifest = buildSearxngManifest('https://my-searx.example.net');
    expect(manifest.request.origin).toBe('https://my-searx.example.net');
    expect(manifest.permissions.network.origins).toEqual([
      'https://my-searx.example.net',
    ]);
  });

  it('rejects a cleartext instance URL', () => {
    const manifest = buildSearxngManifest('http://searx.example.org');
    expect(validateManifest(manifest)).toMatchObject({ valid: false });
  });

  it('rejects an instance URL carrying a path', () => {
    const manifest = buildSearxngManifest('https://searx.example.org/instance');
    expect(validateManifest(manifest)).toMatchObject({ valid: false });
  });

  it('declares no credential — a self-hosted instance is assumed open', () => {
    const manifest = buildSearxngManifest('https://searx.example.org');
    expect(manifest.permissions.credentials).toBeUndefined();
  });

  it('shares the connector id with the Tavily manifest', () => {
    const manifest = buildSearxngManifest('https://searx.example.org');
    expect(manifest.id).toBe(CONNECTOR_ID);
  });
});

describe('TAVILY_MANIFEST', () => {
  it('validates with no special-casing', () => {
    expect(validateManifest(TAVILY_MANIFEST)).toMatchObject({ valid: true });
  });

  it('shares the connector id with the SearXNG manifest', () => {
    expect(TAVILY_MANIFEST.id).toBe(CONNECTOR_ID);
  });

  it('declares exactly the apiKey credential, used only in the Authorization header', () => {
    expect(TAVILY_MANIFEST.permissions.credentials).toEqual([
      { key: 'apiKey', label: 'Tavily API key' },
    ]);
    expect(TAVILY_MANIFEST.request.headers).toEqual({
      Authorization: { credential: 'apiKey' },
    });
  });
});

it('both providers expose the identical tool to the model', () => {
  const searxng = buildSearxngManifest('https://searx.example.org');
  expect(searxng.tool).toEqual(TAVILY_MANIFEST.tool);
});
