# Epic: Connector Framework

> The manifest schema, permission/consent model, tool-routing, and tiered
> trust runtime that every connector — first-party or, eventually,
> third-party — is built on.

## Status

⏳ In Progress

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

#### ✅ 2.1 — Connector manifest schema (Tier 1)

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

- ✅ The Search connector (epic 3) validates against this schema with no
  special-casing. `fixtures/search.manifest.json` is a realistic connector —
  query slot, language slot, literal `format=json`, and a bearer credential —
  and it passes unmodified.

**Design decisions are in
[research 0004](../research/0004-connector-manifest-schema.md).** Two shape
everything else:

- **No expression language, no string interpolation.** A request is literal
  parts plus named slots, and the runtime encodes each slot for the position
  it occupies. Encoding is decided by position rather than declared, so the
  two cannot disagree. The values filling slots come from a language model
  steered by whatever the user pasted into chat, and a format permitting
  interpolation could not later forbid it without breaking every connector
  written against it.
- **A credential may never appear in a URL** — not in the origin, a path
  segment, or a query value. URLs reach proxy logs, `Referer` headers, and
  crash reports.

**What the validator rejects**, each with a test that fails for that reason:

| Rejected | Attack closed |
| --- | --- |
| Credential in query or path | Token leaked through logs |
| Userinfo in an origin | `https://real.example.org@evil.com` resolves to `evil.com` |
| Origin carrying a path, query, or fragment | Author-controlled string joining |
| Literal path segment containing `/`, `?`, `#` | Path traversal, invented structure |
| Cleartext `http` | Refused by iOS ATS on device anyway |
| Request origin outside `permissions.network.origins` | Undeclared network access |
| Slot naming a parameter the tool does not declare | Silently empty value at runtime |
| Credential the user is never asked for | Grant that cannot be honoured |
| Unknown `manifestVersion` | Loading a manifest only partly understood |
| Unknown top-level field | A typo indistinguishable from an unimplemented field |

Validation is two passes: Zod for shape, then cross-field rules for everything
that only makes sense in combination — which is where the security properties
actually live, and none of it expressible as a per-field type. All issues are
reported at once, because a connector author fixing one error per device
round-trip is the slowest possible loop.

**Chosen against Ajv deliberately.** Ajv compiles schemas by generating
JavaScript at runtime; "we generate and execute code derived from a
third-party manifest" is the wrong sentence for this product, independent of
Hermes' restrictions on runtime codegen.

**Left to later tasks.** Response mapping is deliberately minimal — a source
path and a size cap — because turning a response back into model context is
the mirror of the request problem and deserves its own pass. Redirect
handling, timeouts, and retries belong to the runtime host (2.4).

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
