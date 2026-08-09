---
epic: 5
title: Connector Store & SDK
status: "📋 Planned"
scope: shared
---

# Epic: Connector Store & SDK

> Phase 3 — opening the connector layer to third-party developers: SDK,
> plugin template, examples, public registry, and the in-app store.

**Scope note:** platform-neutral by design, not implemented inside one app
first — see the taxonomy note in
[docs/epics/README.md](../README.md#layout).

## Overview

Mirrors `sovereign`'s own plugin-development trio (`sovereign-plugin-template`
+ `sovereign-plugins-examples` + the public plugin registry), adapted for
connectors instead of Next.js modules. This is deliberately the **last**
phase — everything here builds on the [Connector Framework](../mobile/connector-framework.md)
unchanged, per research 0001's "build once, widen without rework" principle.

## Tasks

#### ✅ 5.1 — Connector SDK

**Goal:** A published package with the manifest schema types and a validator,
for connector authors to build and test against before submission.

**Deliverables:**

- Zero-dependency package (mirrors `@sovereignfs/sdk`'s own zero-dep
  constraint) exporting the Tier 1/Tier 2 manifest types and a validator
  function.
- Versioned independently, with the same "no breaking changes in a patch"
  discipline `sovereign`'s SDK follows once this is a public contract.

**Dependencies:** Connector Framework epic (2.1) — reuses its schema
directly, does not redefine it.

**Review checklist:**

- The SDK's validator accepts the exact same manifests the app's own runtime
  (epic 2.4) already accepts — no drift between author-time and load-time
  validation.

**Decided:**

- New package `packages/connector-sdk` (`@sovereignfs/connector-sdk`,
  `0.1.0`), structurally mirroring `sovereign`'s real `@sovereignfs/sdk`
  `package.json` (dual `exports`: raw `src/*.ts` for workspace consumers,
  `publishConfig.exports` pointing at built `dist/*.js`+`.d.ts` for real npm
  consumers).
- The manifest schema (`src/schema.ts`), validator (`src/validate.ts`),
  fixtures, and test suite were **relocated**, not duplicated, from
  `apps/mobile/src/connectors/manifest/` — `apps/mobile` now consumes the
  package via `workspace:*` across all 8 of its former import sites. This is
  what makes the review checklist true by construction: it's the same code
  running in both places, not a second implementation that could drift.
- `packages/core` was deliberately **not** the home for this — its README
  earmarked the schema for future extraction, but that package also covers
  genuinely internal-only concerns (permission state machine, routing,
  adapter interfaces) a third-party connector author has no business
  depending on. `packages/connector-sdk`'s README documents its own scope
  and the Tier-1/Tier-3 status honestly.

**Honest gaps:**

- **"Tier 1/Tier 2 manifest types" (this task's own original deliverable
  text) is not what shipped.** Tier 2 has no schema anywhere yet — its
  sandboxed script runtime (task 5.6) hasn't been designed. The SDK exports
  what the runtime actually accepts today: Tier 1 and Tier 3 (the real
  `connectorManifest` discriminated union). Tier 2 types will be added here
  once 5.6 gives them a real shape.
- **Not actually published to npm.** The package is built and verified
  publish-ready (`pnpm --filter @sovereignfs/connector-sdk build` produces a
  real `dist/index.js` + `dist/index.d.ts`; `publishConfig` is set), but the
  `npm publish` step itself was not performed — no npm account/org
  credentials exist in this environment, and it's an irreversible public
  action regardless of packaging readiness. That's a follow-up for whoever
  holds the project's npm access.

**Verified:**

- `pnpm --filter @sovereignfs/connector-sdk typecheck` / `test` (18 tests,
  the relocated `validate.test.ts` suite, now running under Vitest instead
  of mobile's Jest) / `build` all pass.
- `pnpm --filter mobile typecheck` / `lint` / `test` (223 tests, full suite)
  all pass unchanged after the import rewrite.
- `pnpm check:offline` (root) stays clean — the offline-boundary walk never
  reached into `connectors/` in the first place, and importing from an
  external workspace package doesn't change that.

---

#### ✅ 5.2 — Connector plugin template

**Goal:** A "use this template" starting point for a new third-party
connector.

**Deliverables:**

- Template repo: example manifest, README explaining the tiers and
  submission process, optional Tier 2 script skeleton.

**Dependencies:** Task 5.1.

**Review checklist:**

- A developer unfamiliar with the project can go from cloning the template
  to a submittable connector manifest without reading source code.

**Decided:**

- `templates/connector-plugin-template/` **inside this repo**, not a
  separate GitHub repo. `sovereign`'s own equivalent
  (`sovereign-plugin-template`) is a standalone repo, but creating a new
  public repo is a real, visible action outside what an assistant should
  do without the project owner confirming the exact name and visibility
  first — that's a decision left to a human. The in-repo template can be
  split out into its own repo later with no loss; nothing about its
  content assumes it lives here.
- The example manifest (`manifest.json`, a fictional weather-lookup
  connector) is a genuine, complete Tier 1 example — not an abbreviated
  sketch — and `validate.mjs` runs it through the actual
  `@sovereignfs/connector-sdk` validator, so `npm run validate` in the
  template shows a connector author exactly what the app's own load-time
  check would say.
- The README states plainly which tier is actually usable: **Tier 1
  only.** Tier 3 is first-party-only by design (a manifest alone can't
  authorize native code, since Tier 3 dispatches to a handler already
  registered inside the app). Tier 2 has no runtime yet (task 5.6) — its
  `tier2-preview/` directory is explicitly marked non-functional in its
  own README and in a comment at the top of its one script file, so it
  can't be mistaken for a working example.

**Honest gap:**

- The README's "Submission" section says outright that there is no public
  registry or submission process yet (task 5.4, still 📋). A connector
  built from this template can be validated and run locally, but has
  nowhere to be submitted to yet.

**Verified:**

- Confirmed `manifest.json` actually validates against the real built
  `@sovereignfs/connector-sdk` (`dist/index.js`), not just a
  plausible-looking JSON file: `validateManifest()` returns
  `{ valid: true, ... }`.
- Confirmed the validator is not a rubber stamp: mutating the same
  manifest to smuggle a credential into a URL query value (exactly the
  rule the README calls out) makes `validateManifest()` return
  `{ valid: false, issues: [...] }` with the expected message.

---

#### 📋 5.3 — First-party example connectors

**Goal:** A reference set demonstrating the range of what a connector can
be, mirroring `sovereign-plugins-examples`.

**Deliverables:**

- A simple Tier 1 REST connector, one with token auth, one Tier 2 connector
  with a transform script, one demonstrating the paid/entitlement flow
  (epic 6).

**Dependencies:** Task 5.1, Task 6 (monetization, for the paid example).

**Review checklist:**

- Each example validates against the SDK and installs/runs in the app
  unmodified.

---

#### 📋 5.4 — Public connector registry and submission process

**Goal:** A reviewable, public index of connectors third parties can submit
to.

**Deliverables:**

- A JSON index (mirrors `sovereign`'s `registry/plugins.json` pattern) plus
  a submission process (PR-based or a form).
- Review checklist for submissions: declared network domain matches what the
  manifest actually calls, pricing is declared honestly, tool schema is
  sane. Lighter review burden than native-code review, since Tier 1/2
  connectors ship no arbitrary executable code.

**Dependencies:** Task 5.1.

**Review checklist:**

- A submitted connector manifest that lies about its declared network domain
  is caught by the review process before publication.

---

#### 📋 5.5 — In-app Connector Store

**Goal:** The end-user-facing browse/install surface.

**Deliverables:**

- Browse, search, install, and manage connectors from the registry, inside
  the app.
- Per-connector permission grant happens at install time, reusing epic 2.2's
  consent model unchanged.

**Dependencies:** Task 5.4, Connector Framework epic (2.2).

**Review checklist:**

- Installing a third-party connector from the store goes through the exact
  same permission-grant flow as the first-party Search/Sovereign Tasks
  connectors — no separate, weaker path for third-party connectors.

---

#### 📋 5.6 — Tier 2 sandboxed script runtime

**Goal:** Implement the sandboxed execution environment Tier 2 connectors
run in.

**Deliverables:**

- A capability-restricted script engine (candidates: an embedded Hermes
  isolate, QuickJS, or WASM — choice deferred to a spike, see research 0001's
  open questions) with no ambient filesystem/network/device access beyond
  what the host explicitly injects as call parameters.

**Dependencies:** Task 5.1; blocked on a real Tier 2 use case existing (per
research 0001, don't build this speculatively before something needs it).

**Review checklist:**

- A Tier 2 script cannot access anything — network, filesystem, other
  connectors' credentials — beyond what was explicitly injected as its input
  parameters.

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0001](../../research/0001-concept-and-connector-architecture.md)
- [Connector Framework](../mobile/connector-framework.md)
- `confluence/concepts/plugin-development.md` (the `sovereign` pattern this
  mirrors, in the workbench repo)
