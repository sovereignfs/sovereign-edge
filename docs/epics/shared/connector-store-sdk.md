---
epic: 5
title: Connector Store & SDK
status: "⏳ In Progress — 5.1, 5.2, 5.4, 5.5 done; 5.3 partially done (free + token-auth examples shipped, Tier 2 script and paid examples blocked on 5.6/epic 6); 5.6 still 📋 Planned"
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

#### ⏳ 5.3 — First-party example connectors (in progress — free + token-auth done)

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

**Decided:**

- `examples/connectors/` in-repo (same reasoning as 5.2's template: a
  separate `sovereign-plugins-examples`-style repo is a real, visible
  action left for the project owner, not something to create unprompted).
- Two of the four deliverables shipped now: `simple-rest-open-meteo/` (no
  credentials — every value comes from the model's own tool arguments)
  and `token-auth-github/` (a stored credential injected into a request
  header). Both call real, recognizable public APIs (Open-Meteo's free
  weather API; GitHub's `GET /user`) rather than fabricated endpoints, so
  the manifests read as genuine examples, not placeholders.
- **"Installs/runs in the app unmodified"** doesn't have a literal path to
  exercise yet: neither app has a generic "install an arbitrary manifest"
  feature (that's task 5.5, the in-app store, itself blocked on 5.4's
  registry) — both apps' own connector lists are still hardcoded to the
  first-party Search connector (mobile: `installedConnectors()` in
  `apps/mobile/src/settings/ModelSessionProvider.tsx`; desktop:
  `known_connector_manifests()` in `apps/desktop/src-tauri/src/lib.rs`).
  Read literally, the checklist can't be satisfied by either app today,
  for any connector. Read for what it's actually checking — that a
  manifest runs through the real, connector-agnostic runtime code
  unmodified, not a special-cased reimplementation — it's provable now:
  `apps/mobile/src/connectors/runtime/examples.smoke.test.ts` calls the
  same `executeConnectorCall` the app itself calls, against a real local
  TCP listener (mirroring the Rust side's own real-socket test in
  `apps/desktop/src-tauri/src/connectors/orchestration.rs`), not a mocked
  `fetch`.

**Honest gaps:**

- The Tier 2 transform-script example and the paid/entitlement example
  remain undone, blocked on task 5.6 (no sandboxed runtime exists) and
  epic 6 (monetization) respectively — the user explicitly asked to skip
  the paid example and do only the free/token-auth pair for now.
- The token-auth example surfaces a real schema constraint worth stating
  plainly: manifests have no string interpolation, so a stored credential
  must already be the complete header value (e.g. `Bearer <token>`) — a
  connector can't declare a prefix. Documented in the example's own
  README rather than hidden.

**Verified:**

- Both example manifests pass `validateManifest()` from the real,
  installed `@sovereignfs/connector-sdk`.
- `apps/mobile/src/connectors/runtime/examples.smoke.test.ts`: both
  examples pass through `executeConnectorCall` against a real loopback
  HTTP server (no mocked `fetch`) — the free example's slot-filled query
  parameters reach the server correctly, and the token-auth example's
  `Authorization` header carries the exact credential value read from the
  (mocked) vault, proving the credential-injection path works end to end.
- `pnpm --filter mobile typecheck` / `lint` / `test` (225 tests, full
  suite, up from 223 — the two new smoke tests) all pass.
- `pnpm check:offline` (root) stays clean.

---

#### ✅ 5.4 — Public connector registry and submission process

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

**Decided:**

- `registry/connectors.json` — a real deviation from `sovereign`'s own
  `registry/plugins.json` pattern, made deliberately: `sovereign` plugin
  entries point at external git repositories shipping real code, so
  validating one means cloning the source, checking its manifest/LICENSE,
  and pinning a content hash against later drift. A Tier 1/2 connector has
  no code at all — "no connector-specific code exists in the runtime; a
  manifest is the whole of a Tier 1 connector" (the Connector Framework
  epic's own words). So a registry entry here **embeds the manifest
  directly** (`{ id, submittedBy, manifest }`) instead of pointing at one.
  There's nothing external to fetch and nothing that can drift after
  review — the manifest in the PR diff is exactly what ships — so no
  content-hash provenance step exists here; `registry/CONTRIBUTING.md`
  explains why, explicitly, rather than silently doing less than the
  pattern it mirrors.
- **The network-domain-lying check is not a manual review step — it's
  structural**, and already existed before this task: `validateManifest`
  (task 2.1/5.1, unchanged) already rejects a manifest whose
  `request.origin` isn't a member of its own declared
  `permissions.network.origins`. `registry/validate.mjs` calls that exact
  function against every entry's embedded manifest, so the review
  checklist's own example is satisfied by construction, not by a
  reviewer's judgment call.
- Pricing-honesty and tool-schema-sanity are **not** machine-checkable
  from the manifest alone (the schema requires *a* `pricing` value, not a
  true one) — `registry/CONTRIBUTING.md` and the new
  `.github/PULL_REQUEST_TEMPLATE/registry-submission.md` say so plainly,
  rather than implying automated validation covers more than it does.
- The registry starts genuinely empty (`"connectors": []`) rather than
  seeded with the task 5.3 example connectors — those are documentation
  examples (`com.example.*` ids), not real submissions, and mixing
  placeholder entries into a "public, reviewable index" would misrepresent
  what's actually been submitted and reviewed. Nothing has, yet.
- Wired into CI (`.github/workflows/ci.yml`, `pnpm registry:check`) rather
  than left as a local-only script — a submission's validity is checked on
  every PR touching it, the same as every other correctness gate in this
  repo.

**Honest gap:**

- The registry has no consumer. Neither app has a "browse/install from the
  registry" feature yet — that's task 5.5, itself blocked on this task,
  still 📋 Planned. A merged entry here is real (reviewed, validated,
  version-controlled) but nothing reads from it yet. Stated explicitly in
  `registry/CONTRIBUTING.md`'s own "Status" section.

**Verified:**

- `pnpm registry:validate` (builds `@sovereignfs/connector-sdk`, then
  validates the real committed `registry/connectors.json`) passes.
- `pnpm registry:test` (`node --test`, no external test framework needed
  for a script this small): 7 real assertions, including — the one that
  matters most for this task's review checklist — a manifest whose
  `request.origin` doesn't match its declared `permissions.network.origins`
  is rejected with an explicit `permissions.network.origins` error, proving
  the "lying about its network domain" case is actually caught, not just
  assumed to be.
- `pnpm lint` / `pnpm typecheck` / `pnpm check:offline` (root, all
  workspace packages) stay clean.
- `.github/workflows/ci.yml`'s new step and YAML syntax verified valid.

---

#### ✅ 5.5 — In-app Connector Store

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

**Decided:**

- **Live registry fetch**, not a build-time snapshot — the first network
  access in either app that isn't a specific granted connector's own
  request. Explicit, user-facing about that: both store screens state
  plainly that this one screen reaches the internet for its own sake,
  rather than fetching silently the way every other screen in either app
  never does. Mobile reuses `allowNetworkForConnector` (already a generic
  "network access from `src/connectors/`" door, not connector-execution-
  specific); desktop reuses `AppState`'s existing `connector_http_client`
  and wraps only the request `.send()` in `net_guard::allow_network`,
  mirroring `execute.rs`'s own pattern.
- **Extended the manifest schema to add a `"desktop"` platform value**
  (`packages/connector-sdk` 0.1.0 → 0.2.0, plus Rust's `Platform` enum)
  rather than have desktop's store ignore `platforms` — additive, non-
  breaking. The two already-merged registry entries need a follow-up PR
  adding `"desktop"` to their `platforms` arrays before they'll actually
  appear in desktop's own store (both are plain Tier 1 HTTP calls, work
  identically regardless of OS).
- **"Install" is exactly "configure and grant," reused unchanged.** Both
  platforms' `grant()`/`revoke()` already accepted an arbitrary
  `ConnectorManifest` with no dependency on anything being "installed"
  first — this task's real, non-obvious cost was elsewhere: neither app
  had a persisted "which connectors does this device have" concept before
  this. Mobile's `ConnectorsScreen`/`ModelSessionProvider` and desktop's
  `known_connector_manifests()` all just rebuilt Search's manifest from
  its own config on the fly, since Search was the only connector that
  could ever exist. `connectors/store/installed.ts` (mobile) and
  `connectors/installed.rs` (desktop) are that persistence, the first
  time either — mirroring `grants.json`'s own plain-JSON, fail-closed
  pattern, keyed by connector id, re-validated on every desktop read
  (`ConnectorManifest` has no derived `Deserialize`, per its own doc
  comment) so a manifest that no longer validates reads as "not
  installed" rather than a stale value trusted anyway.
- Store screens exclude Tier 3 entries (nothing in the store could ever
  make one work — Tier 3 dispatches to a handler already registered
  inside the app) and disable install for a `paid` entry (epic 6 doesn't
  exist yet, so there is no working purchase path).
- A found-in-passing, unrelated bug fixed while building this: desktop's
  `connectors/manifest/fixtures.rs` still pointed its `include_str!`s at
  `apps/mobile/src/connectors/manifest/fixtures/`, which task 5.1 moved
  to `packages/connector-sdk/src/fixtures/` months earlier without
  updating this reference (task 5.1 was TS-only work; desktop's own
  `cargo build` wasn't run as part of it). Fixed in its own commit before
  this task's real work started.

**Honest gaps:**

- No "update" flow for an already-installed connector whose registry
  entry later changes shape — re-installing (same id) overwrites, but
  there's no notification that an update exists.
- Search is a client-side substring filter over name/summary, not a real
  search backend — adequate for a registry with a handful of entries, not
  designed to scale past that.
- Neither store screen was exercised through a real native Tauri window
  in this environment (no way to drive one directly here) — see
  "Verified" below for exactly what was and wasn't proven.

**Verified:**

- Mobile: 258 tests pass (up from 225), including a real loopback-server
  test proving the fetch+parse+re-validate path against a genuine HTTP
  response.
- Desktop: 128 Rust tests pass (up from 117, includes a real-TCP registry
  fetch test), 49 TS tests pass (up from 39). typecheck/lint/prettier/
  offline-boundary all clean on both platforms.
- A real (temporary, not committed) check confirmed `fetch_registry()`
  genuinely reaches `raw.githubusercontent.com/.../registry/
  connectors.json` and correctly returns both real merged entries
  (`fs.sovereign.weather-open-meteo`, `fs.sovereign.github-whoami`).
- A real desktop debug binary was built and launched (not just compiled)
  — started cleanly, stayed running, no panic — proving the new commands
  don't break app startup.
- Browser-pane verification covered navigation and rendering only:
  Tauri's IPC bridge only exists inside a real native webview window,
  which this environment has no way to drive directly, so `invoke()`
  calls made through the Browser pane's plain-HTTP preview never resolve
  (confirmed: `ConnectorsScreen` shows "Loading connectors…"
  indefinitely there, exactly as expected, not a bug).

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
