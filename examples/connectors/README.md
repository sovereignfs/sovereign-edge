# Example connectors

Reference Tier 1 manifests demonstrating the range of what a connector can
be, for anyone building against [`@sovereignfs/connector-sdk`](../../packages/connector-sdk)
or the [connector plugin template](../../templates/connector-plugin-template).

| Example | Demonstrates |
| --- | --- |
| [`simple-rest-open-meteo/`](simple-rest-open-meteo/) | A minimal Tier 1 connector with no credentials at all — every value the request needs comes from the model's own arguments. |
| [`token-auth-github/`](token-auth-github/) | A Tier 1 connector that requires a stored credential, injected into a request header rather than the URL. |

Both are genuine, complete manifests — not abridged sketches — and both
are proven to run end-to-end through the app's real, unmodified connector
runtime (`executeConnectorCall` in `apps/mobile/src/connectors/runtime/execute.ts`)
against a real local HTTP server in
[`apps/mobile/src/connectors/runtime/examples.smoke.test.ts`](../../apps/mobile/src/connectors/runtime/examples.smoke.test.ts) —
not just schema-validated in isolation.

## What's not here yet

The full task 5.3 deliverable list also calls for a Tier 2 connector (a
sandboxed transform script) and one demonstrating the paid/entitlement
flow. Neither is included:

- **Tier 2** has no sandboxed runtime yet (task 5.6, still 📋 Planned) —
  see the [connector plugin template's `tier2-preview/`](../../templates/connector-plugin-template/tier2-preview/)
  for why a "working" Tier 2 example can't exist before that lands.
- **Paid/entitlement** depends on epic 6 (Monetization), which hasn't
  been built either.

Both remain open work under [task 5.3](../../docs/epics/shared/connector-store-sdk.md#-53--first-party-example-connectors).

## Trying an example

```bash
cd examples/connectors/simple-rest-open-meteo   # or token-auth-github
npm install @sovereignfs/connector-sdk
node --input-type=module -e "
import { validateManifest } from '@sovereignfs/connector-sdk';
import { readFileSync } from 'node:fs';
console.log(validateManifest(JSON.parse(readFileSync('./manifest.json', 'utf8'))));
"
```
