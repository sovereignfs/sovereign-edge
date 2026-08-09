# Contributing to the connector registry

`registry/connectors.json` is the reviewable, public index of Tier 1
connectors third parties can submit to Sovereign Edge. This document is
the submission process and review checklist task 5.4 calls for.

## How this differs from `sovereign`'s plugin registry

If you've contributed to `sovereign`'s `registry/plugins.json`, the shape
here will look familiar but the mechanics are simpler, for a real reason:
a `sovereign` plugin entry points at an external git repository shipping
actual code, so review has to clone that source, check its manifest and
`LICENSE`, and pin a content hash so a later silent change to the source
doesn't retroactively change what was approved.

A Tier 1 (or, once task 5.6 ships, Tier 2) connector has no code at all —
per the [Connector Framework epic](../docs/epics/mobile/connector-framework.md),
"no connector-specific code exists in the runtime; a manifest is the
whole of a Tier 1 connector." So a registry entry here **embeds the
manifest directly** rather than pointing at one. There's nothing external
to fetch, and nothing that can drift after review: the manifest in your
pull request diff is exactly what a reviewer approves and exactly what
ships. No content-hash provenance step is needed for something that
never leaves the PR that introduced it.

## Submitting a connector

1. Fork this repo and add one entry to the `connectors` array in
   [`connectors.json`](connectors.json):

   ```json
   {
     "id": "com.yourdomain.your-connector",
     "submittedBy": { "name": "Your Name", "contact": "you@example.com" },
     "manifest": { "...": "your full Tier 1 manifest, unmodified" }
   }
   ```

   Your manifest should be exactly the same JSON you've tested with
   [`@sovereignfs/connector-sdk`](../packages/connector-sdk) or the
   [connector plugin template](../templates/connector-plugin-template) —
   don't hand-edit it after the fact to fit into this file.

2. Run the validator locally before opening a PR:

   ```bash
   pnpm registry:check
   ```

   This is the same check CI runs (`.github/workflows/ci.yml`). It fails
   loudly, with the entry's `id` and the exact schema/cross-field issue,
   if anything is wrong — including if your declared network domain
   doesn't match what your manifest actually calls (see below).

3. Open a pull request using the connector-registry-submission template.

## What's checked automatically, and what isn't

`pnpm registry:check` runs the exact same `validateManifest` function
the app itself loads connectors with (`@sovereignfs/connector-sdk`),
against your embedded manifest. That means the properties task 2.1's
schema already guarantees are enforced here too, automatically:

- **Your declared network domain matches what you actually call.** This
  task's own review checklist calls out "a submitted connector manifest
  that lies about its declared network domain is caught by the review
  process before publication" as the bar to clear — this isn't a manual
  review step, it's structural. `request.origin` must be a member of
  `permissions.network.origins`, or validation fails outright.
- No credential appears in a URL (query, path, or origin) — only in a
  header or body.
- Every slot your request references is declared in
  `tool.parameters.properties`; every credential it references is
  declared in `permissions.credentials`.
- `entry.id` and `entry.manifest.id` match, and no two entries share an
  `id`.

**What a human reviewer still has to judge**, because these aren't
machine-checkable from the manifest alone:

- **Pricing is declared honestly.** The schema requires *a* `pricing`
  field (`free`, or `paid` with a `productId`) — it can't tell whether a
  connector that's actually free claims `paid`, or vice versa.
- **The tool schema is sane.** `tool.description` and
  `tool.parameters` are validated for *shape* (valid JSON Schema, matches
  the slots the request actually uses) but not for whether the
  description is an accurate, non-misleading account of what the
  connector does.
- Whether the connector is something Sovereign Edge actually wants
  listed — a lighter bar than `sovereign`'s native-code review (per this
  task's own goal — Tier 1/2 connectors "ship no arbitrary executable
  code"), but still a real editorial judgment.

## Status

**Honest gap:** this registry has no consumer yet. Neither app has a
generic "browse and install a connector from a registry" feature — that's
[task 5.5](../docs/epics/shared/connector-store-sdk.md#-55--in-app-connector-store),
still 📋 Planned, and itself depends on this task. Submitting an entry
here is real (it's reviewed, validated, and merged), but until 5.5 ships
there's no in-app path that reads from it yet.
