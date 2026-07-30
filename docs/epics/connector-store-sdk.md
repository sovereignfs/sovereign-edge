# Epic: Connector Store & SDK

> Phase 3 — opening the connector layer to third-party developers: SDK,
> plugin template, examples, public registry, and the in-app store.

## Status

📋 Planned

## Overview

Mirrors `sovereign`'s own plugin-development trio (`sovereign-plugin-template`
+ `sovereign-plugins-examples` + the public plugin registry), adapted for
connectors instead of Next.js modules. This is deliberately the **last**
phase — everything here builds on the [Connector Framework](connector-framework.md)
unchanged, per research 0001's "build once, widen without rework" principle.

## Tasks

#### 📋 5.1 — Connector SDK

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

---

#### 📋 5.2 — Connector plugin template

**Goal:** A "use this template" starting point for a new third-party
connector.

**Deliverables:**

- Template repo: example manifest, README explaining the tiers and
  submission process, optional Tier 2 script skeleton.

**Dependencies:** Task 5.1.

**Review checklist:**

- A developer unfamiliar with the project can go from cloning the template
  to a submittable connector manifest without reading source code.

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

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)
- [Connector Framework](connector-framework.md)
- `confluence/concepts/plugin-development.md` (the `sovereign` pattern this
  mirrors, in the workbench repo)
