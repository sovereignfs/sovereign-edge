import deviceInfoManifest from './fixtures/device-info.manifest.json';
import searchManifest from './fixtures/search.manifest.json';
import { validateManifest } from './validate';

/**
 * The security-shaped cases are the point of this file.
 *
 * A manifest is untrusted input — first-party today, third-party in Phase 3 —
 * and the values filling its slots come from a language model steered by
 * whatever the user pasted into chat. Each rejection below closes an attack
 * that free string interpolation would have made expressible.
 */

/** The fixture, with one branch replaced. */
function withRequest(patch: Record<string, unknown>) {
  return {
    ...searchManifest,
    request: { ...searchManifest.request, ...patch },
  };
}

describe('validateManifest', () => {
  it('accepts the Search connector with no special-casing', () => {
    // Epic 2.1's review checklist. The fixture is a real connector shape, not
    // a minimal object built to satisfy the validator.
    const result = validateManifest(searchManifest);
    expect(result).toMatchObject({ valid: true });
  });

  it('rejects a manifest version it does not understand', () => {
    // Refusing to load beats loading with a field silently ignored — the
    // ignored field is as likely to be a permission as a label.
    const result = validateManifest({ ...searchManifest, manifestVersion: 2 });
    expect(result).toMatchObject({
      valid: false,
      issues: [{ path: 'manifestVersion' }],
    });
  });

  describe('the URL is not forgeable', () => {
    it('refuses a credential in a query value', () => {
      // URLs reach proxy logs, Referer headers, and crash reports.
      const result = validateManifest(
        withRequest({
          query: {
            ...searchManifest.request.query,
            token: { credential: 'apiToken' },
          },
        }),
      );
      expect(result).toMatchObject({ valid: false });
      if (result.valid) throw new Error('expected rejection');
      expect(result.issues[0]!.message).toMatch(/may not appear in a URL/);
    });

    it('refuses a credential in a path segment', () => {
      const result = validateManifest(
        withRequest({
          path: [{ literal: 'search' }, { slot: 'query' }],
          query: { token: { credential: 'apiToken' } },
        }),
      );
      expect(result).toMatchObject({ valid: false });
    });

    it('refuses userinfo smuggled into the origin', () => {
      // https://searx.example.org@evil.com resolves to evil.com.
      const origin = 'https://searx.example.org@evil.com';
      const result = validateManifest({
        ...searchManifest,
        permissions: {
          ...searchManifest.permissions,
          network: { origins: [origin] },
        },
        request: { ...searchManifest.request, origin },
      });
      expect(result).toMatchObject({ valid: false });
    });

    it('refuses an origin carrying a path', () => {
      // Everything after the host must be expressed as structured parts, so
      // the runtime — not the author — decides how segments are joined.
      const result = validateManifest(
        withRequest({ origin: 'https://searx.example.org/search' }),
      );
      expect(result).toMatchObject({ valid: false });
      if (result.valid) throw new Error('expected rejection');
      expect(result.issues[0]!.message).toMatch(/no path, query, or fragment/);
    });

    it('refuses a literal path segment containing a slash', () => {
      // A segment that can contain "/" can invent path structure.
      const result = validateManifest(
        withRequest({ path: [{ literal: 'search/../admin' }] }),
      );
      expect(result).toMatchObject({ valid: false });
    });

    it('refuses cleartext http', () => {
      const origin = 'http://searx.example.org';
      const result = validateManifest({
        ...searchManifest,
        permissions: {
          ...searchManifest.permissions,
          network: { origins: [origin] },
        },
        request: { ...searchManifest.request, origin },
      });
      expect(result).toMatchObject({ valid: false });
    });
  });

  describe('declared access is the whole of the access', () => {
    it('refuses a request to an origin outside the allowlist', () => {
      // The allowlist is what the user is shown before granting. A request
      // outside it would be refused at runtime, so this turns a runtime
      // failure into an authoring error.
      const result = validateManifest(
        withRequest({ origin: 'https://other.example.org' }),
      );
      expect(result).toMatchObject({ valid: false });
      if (result.valid) throw new Error('expected rejection');
      expect(result.issues[0]!.message).toMatch(/must be declared/);
    });

    it('refuses a credential the user is never asked for', () => {
      const result = validateManifest(
        withRequest({
          headers: { Authorization: { credential: 'undeclaredToken' } },
        }),
      );
      expect(result).toMatchObject({ valid: false });
      if (result.valid) throw new Error('expected rejection');
      expect(result.issues[0]!.message).toMatch(/not declared/);
    });
  });

  describe('slots are bound to the tool the model sees', () => {
    it('refuses a slot the tool does not declare', () => {
      // The model can only fill slots it knows about; an undeclared one
      // would silently be empty at runtime.
      const result = validateManifest(
        withRequest({
          query: { q: { slot: 'notAParameter' } },
        }),
      );
      expect(result).toMatchObject({ valid: false });
      if (result.valid) throw new Error('expected rejection');
      expect(result.issues[0]!.message).toMatch(/not declared in tool/);
    });

    it('reports every problem at once rather than the first', () => {
      // A connector author fixing one error at a time through a device
      // round-trip is the slowest possible loop.
      const result = validateManifest(
        withRequest({
          query: { a: { slot: 'nope' }, b: { credential: 'alsoNope' } },
        }),
      );
      if (result.valid) throw new Error('expected rejection');
      expect(result.issues.length).toBeGreaterThan(1);
    });
  });

  it('rejects unknown top-level fields', () => {
    // A misspelled field name is otherwise indistinguishable from a field
    // this build does not implement yet.
    const result = validateManifest({ ...searchManifest, permission: {} });
    expect(result).toMatchObject({ valid: false });
  });

  it('rejects a body on a GET', () => {
    const result = validateManifest(
      withRequest({ body: { q: { slot: 'query' } } }),
    );
    expect(result).toMatchObject({ valid: false });
  });

  describe('Tier 3 (task 2.6)', () => {
    it('accepts a native-handler connector with no special-casing', () => {
      const result = validateManifest(deviceInfoManifest);
      expect(result).toMatchObject({ valid: true });
    });

    it('refuses a handler capability outside the declared allowlist', () => {
      // Same shape as Tier 1's origin-allowlist check: what dispatch reaches
      // for must be a subset of what the user was shown before granting.
      const result = validateManifest({
        ...deviceInfoManifest,
        handler: { capability: 'calendar.write' },
      });
      expect(result).toMatchObject({ valid: false });
      if (result.valid) throw new Error('expected rejection');
      expect(result.issues[0]!.message).toMatch(/must be declared/);
    });

    it('rejects a Tier 1 request/response shape smuggled onto a Tier 3 manifest', () => {
      // Additive, not a migration: a Tier 3 manifest cannot borrow Tier 1's
      // HTTP fields, and vice versa — the schema is strict either way.
      const result = validateManifest({
        ...deviceInfoManifest,
        request: searchManifest.request,
      });
      expect(result).toMatchObject({ valid: false });
    });

    it('rejects an unknown top-level field the same as Tier 1 does', () => {
      const result = validateManifest({
        ...deviceInfoManifest,
        permission: {},
      });
      expect(result).toMatchObject({ valid: false });
    });
  });
});
