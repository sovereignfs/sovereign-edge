# @sovereignfs/connector-sdk

Types and a validator for Sovereign connector manifests — the JSON
documents that describe a connector's tool definition, permissions, and
(for Tier 1) how its calls are translated into an HTTP request.

This is the same schema and validator the Sovereign apps themselves use
at runtime (`apps/mobile` imports this package directly; the desktop app
has a hand-ported Rust equivalent kept in lockstep by review). Nothing
here is a simplified or documentation-only copy — validating a manifest
with this package is validating it exactly as the runtime would.

## Status

Tiers supported today: **Tier 1** (hosted HTTP connectors) and **Tier 3**
(native device-capability connectors). **Tier 2** (sandboxed script
connectors) has no schema yet — its runtime design (task 5.6) hasn't
landed, so this package doesn't speculate about its shape.

This package is versioned and packaged to be publishable
(`publishConfig`, a real `tsup` build), but has **not been published to
npm**. Publishing is a follow-up step for the project owner, who has the
actual npm credentials — this package only gets it ready.

## Usage

```ts
import { validateManifest, type ConnectorManifest } from '@sovereignfs/connector-sdk';

const result = validateManifest(someJson);
if (result.valid) {
  const manifest: ConnectorManifest = result.manifest;
} else {
  console.error(result.issues); // ValidationIssue[]: { path, message }
}
```

`connectorManifest` (a Zod discriminated union on `tier`) and its two
members `connectorManifestTier1` / `connectorManifestTier3` are also
exported directly, for callers who want raw Zod parsing instead of the
`validateManifest` wrapper's cross-field checks (allowlist membership,
credential-never-in-URL, slot/credential declaration, etc.).

## Development

- `pnpm --filter @sovereignfs/connector-sdk typecheck`
- `pnpm --filter @sovereignfs/connector-sdk test`
- `pnpm --filter @sovereignfs/connector-sdk build` — produces `dist/`
  via `tsup` (ESM + `.d.ts`); not run as part of normal workspace dev,
  since `exports` points consumers at `src/*.ts` directly.
