# Sovereign Edge connector plugin template

A starting point for building a connector for [Sovereign Edge](https://github.com/sovereignfs/sovereign-edge) —
a fully offline, on-device AI companion. Connectors are how it reaches the
outside world: each one is a small, declarative description of one
capability (an API call, a device reading) that the model can invoke,
gated behind an explicit, per-connector permission the user grants.

## The three trust tiers

Every connector declares a `tier`. Only one of them is open to
third-party authors today:

| Tier | What it is | Open to third parties? |
| --- | --- | --- |
| **1** | A declarative manifest only — tool schema, one HTTP endpoint, auth, response mapping. No connector-specific code runs; the app's own runtime does the whole request. | **Yes — this is what this template builds.** |
| **2** | Tier 1 plus a sandboxed transform script for cases a pure declarative request/response mapping can't express. | Not yet. The sandboxed runtime it depends on hasn't been built — see [`tier2-preview/`](tier2-preview/) and the note below. |
| **3** | First-party native OS integration (device sensors, calendar, etc.), dispatched to a handler registered inside the app itself. | No. There is nothing here for a manifest alone to authorize — Tier 3 requires code shipped inside the app. |

If what your connector needs fits in a single HTTP request with request
parameters coming from the model and headers/body carrying a credential,
**Tier 1 covers you** — this template is a working Tier 1 example, not a
toy: it validates with the exact schema and validator the app itself
uses at load time (`@sovereignfs/connector-sdk`), so a manifest that
passes `pnpm validate` here is provably the same shape the app accepts.

## What's in this template

- [`manifest.json`](manifest.json) — a complete, valid Tier 1 example (a
  fictional weather-lookup connector). Replace its `id`, `tool`,
  `permissions`, `request`, and `response` fields with your own.
- [`validate.mjs`](validate.mjs) — validates `manifest.json` against the
  real SDK and prints exactly what a real load-time rejection would say.
- [`tier2-preview/`](tier2-preview/) — an inert sketch of what a Tier 2
  connector might look like once that runtime exists. **Not functional.**

## Get started

```bash
npm install
npm run validate
```

Edit `manifest.json`, then re-run `npm run validate` until it passes.
The validator's error messages are the same ones the app itself would
show — there's no separate "author-time" leniency to trip over later.

A few load-bearing rules the schema enforces, worth knowing up front:

- **No string interpolation.** A request is built from literal parts and
  named slots (`{ "slot": "place" }`); you cannot construct a URL or
  header value by concatenation. This is what keeps a manifest from being
  able to express origin escape, path traversal, or header injection —
  see `permissions.network.origins`/`request.path`/`request.query` in the
  example.
- **A credential may never appear in a URL** — not in the origin, a path
  segment, or a query value. Put it in `request.headers` or
  `request.body`. URLs end up in proxy logs and crash reports; headers
  and bodies (for HTTPS) don't.
- **Every origin the request reaches must be declared** in
  `permissions.network.origins` — this is what the user sees and grants
  before the connector can run, and what the runtime enforces regardless
  of what the manifest's `request.origin` claims.

## Submission

**Honest gap:** there is no public connector registry or submission
process yet — that's task 5.4 in the
[Connector Store & SDK epic](https://github.com/sovereignfs/sovereign-edge/blob/main/docs/epics/shared/connector-store-sdk.md),
still planned. Until it exists, a connector built from this template can
be validated and exercised locally, but there's no public place to
submit it. Watch that epic doc for when 5.4 lands.

## Learn more

- [Connector Framework epic](https://github.com/sovereignfs/sovereign-edge/blob/main/docs/epics/mobile/connector-framework.md) — the full design behind the manifest schema, permission model, and tiers.
- [`@sovereignfs/connector-sdk` README](https://github.com/sovereignfs/sovereign-edge/blob/main/packages/connector-sdk/README.md) — the package this template validates against.
