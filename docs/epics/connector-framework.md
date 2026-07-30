# Epic: Connector Framework

> The manifest schema, permission/consent model, tool-routing, and tiered
> trust runtime that every connector — first-party or, eventually,
> third-party — is built on.

## Status

📋 Planned

## Overview

This is the foundation research 0001 calls out as needing to be right from
Phase 1: even though only one connector (Search) exists at first and it's
hardcoded, it must already be expressed in the same shape a downloaded,
third-party connector will use in Phase 3. Getting this epic right is what
lets Phase 2 and Phase 3 be purely additive.

Three trust tiers, per CONCEPT.md:

- **Tier 1** — declarative manifest only (tool schema, endpoint, auth,
  request/response templates). No code. Open to third parties in Phase 3.
- **Tier 2** — a sandboxed transform script on top of Tier 1. Open to third
  parties in Phase 3, once a real use case justifies building it.
- **Tier 3** — first-party native OS integration. Not opened to third
  parties in this project's current scope.

## Tasks

#### 📋 2.1 — Connector manifest schema (Tier 1)

**Goal:** Define the declarative shape every Tier 1 connector — first-party
or third-party — conforms to.

**Deliverables:**

- Schema fields: `id`, `name`, `version`, `tier`, `tool` (name + JSON schema
  for the LLM's function-call), `permissions` (declared network domain,
  credential storage), `endpoint`/`request`/`response` templates, `pricing`,
  `platforms`.
- A validator (used both at connector-author time and at load time).
- Written and versioned even though only one connector uses it in Phase 1 —
  this is the piece Phase 3 reuses without a rewrite.

**Dependencies:** none within this epic — first task.

**Review checklist:**

- The Search connector (epic 3) validates against this schema with no
  special-casing.

---

#### 📋 2.2 — Permission and consent model

**Goal:** Per-connector, explicit, revocable permission grants — never a
blanket "this app can use the network" toggle.

**Deliverables:**

- Grant/revoke UI per connector.
- Per-connector scoped credential storage (OS keychain), isolated so one
  connector's token is never visible to another.
- A settings surface listing every installed connector and its current
  permission state.

**Dependencies:** Task 2.1.

**Review checklist:**

- Revoking one connector's permission does not affect any other connector's
  access or stored credentials.

---

#### 📋 2.3 — Tool-routing / intent-detection layer

**Goal:** Let the local model decide "this needs a connector" vs. "just
answer in chat," and pick the right one.

**Deliverables:**

- Prompt/grammar-constrained decoding (e.g. GBNF-style grammar via
  `llama.cpp`) so tool-call output is reliably valid JSON even from a small
  on-device model — small models are not reliable free-form tool-callers
  without this constraint.
- Fallback behavior when no connector matches or the matching connector
  lacks permission (explain to the user what's needed, don't silently fail).

**Dependencies:** Task 2.1, Task 1.1 (inference engine).

**Review checklist:**

- A request that should trigger a connector call produces valid, schema-
  conformant tool-call output in a controlled test set, not just "it usually
  works."

---

#### 📋 2.4 — Connector runtime host

**Goal:** Execute a validated tool call against a Tier 1 connector's
manifest.

**Deliverables:**

- Request/response template execution (map the LLM's structured call into
  an HTTP request per the manifest, map the HTTP response back into text/
  data for the model).
- Reserved extension points for Tier 2 (sandboxed script execution) and
  Tier 3 (native module dispatch), even if unimplemented until epic 5/9
  needs them.

**Dependencies:** Task 2.1, Task 2.2, Task 2.3.

**Review checklist:**

- A Tier 1 connector's manifest alone (no connector-specific code) is enough
  to execute a real request/response round trip.

---

#### 📋 2.5 — In-chat connector provenance

**Goal:** Make it visible in the UI which connector (if any) answered a given
message — per CONCEPT.md's "always show which trust tier is active."

**Deliverables:**

- A visible marker in chat distinguishing a fully-offline reply from one that
  used a specific named connector.

**Dependencies:** Task 2.4, Task 1.3 (chat UI).

**Review checklist:**

- A user can tell, without opening settings, whether a given reply touched
  the network and which connector did it.

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)

## Cross-references

- The Search connector (epic 3) and Sovereign Tasks connector (epic 4) are
  the first consumers of this framework.
- Epic 5 (Connector Store & SDK) reuses this framework's manifest schema
  unchanged when opening it to third parties.
