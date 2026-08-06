---
id: 4
title: "Connector manifest schema: format, validation, and the templating surface"
status: "Decided — implemented in task 2.1"
date: "August 2026"
author: "Claude Code (session with the developer)"
scope: shared
summary: "Task 0.1.13 / epic 2.1 — the declarative shape every Tier 1 connector conforms to"
---

# Research 0004 — Connector manifest schema: format, validation, and the templating surface

**Related:** [0001](0001-concept-and-connector-architecture.md) (tiered
connector model, per-connector permissions),
[network-audit](../network-audit.md) (the boundary this framework is the
sanctioned exception to)

---

## Question

Epic 2.1 lists the fields a Tier 1 connector manifest carries. It does not say
what format the schema is written in, what validates it, how it survives
version changes, or — the part with teeth — **how values produced by a
language model get turned into an HTTP request without becoming an injection
vector.**

This is the piece epic 5 reuses unchanged when third parties start writing
connectors. A field can be added later; a templating design cannot be
retrofitted once manifests exist in the wild.

## Findings

### `llama.rn` already converts JSON Schema to a decoding grammar

Task 2.3 requires that a small on-device model emit "reliably valid JSON even
from a small on-device model". That capability is already present in the
dependency this project uses, and it is shaped around JSON Schema
specifically:

- `completion()` accepts `json_schema`, documented in `src/types.ts` as
  "JSON schema for convert to grammar for structured JSON output".
- `response_format: { type: 'json_schema' }` is supported.
- The native side bundles `cpp/common/json-schema-to-grammar.cpp`.
- `tools` and `tool_choice` are accepted directly.

**Consequence:** if a manifest's tool parameters are written as JSON Schema,
grammar-constrained decoding in task 2.3 costs nothing to add. Any other
format means writing and maintaining a converter to get the same guarantee.

### Tool-calling support is a property of the loaded model, not the connector

`llama.rn` reports per-model capability at load time:

```
chatTemplates.jinja.defaultCaps.{ tools, toolCalls, systemRole, parallelToolCalls }
chatTemplates.jinja.toolUse
```

So "can this model call tools at all" is answerable at runtime from the model,
and does not belong in the manifest. A connector manifest describes the tool;
whether the current model can invoke it is a separate, detectable fact. This
matters for task 2.3's required fallback behaviour — the honest message when
tool-calling is unavailable is about the *model*, not the connector.

### There is no validation library in the project today

Dependencies are deliberately few: `@noble/hashes`, four Expo packages,
`llama.rn`, React Native and navigation. Nothing does runtime schema
validation. Whatever 2.1 chooses is a new dependency in a project that has
just published an audit of its dependency surface — so the choice needs a
reason beyond familiarity.

Ajv, the usual JSON Schema validator, compiles schemas by generating
JavaScript at runtime. That is a poor fit here on two counts: Hermes
restricts runtime code generation, and "we generate and execute code derived
from a third-party manifest" is precisely the sentence a security reviewer
will stop on. It should not be the default choice for this project.

### The templating step is the real security surface

A Tier 1 connector maps a model-produced tool call into an HTTP request. The
model's output is *untrusted input* — it is influenced by whatever the user
pasted into chat, and small models are easy to steer. If a manifest can
express "put this argument here" as free string interpolation, the following
all become reachable:

- **Origin escape** — an argument that changes host, port, or scheme
  (`https://api.example.com/@evil.com/`, or a leading `//`).
- **Path traversal** — `../../admin` in a segment.
- **Header injection** — CRLF in a value.
- **Credential leakage** — a token interpolated into a URL, which then lands
  in a proxy log or a `Referer`.
- **SSRF onto the user's own LAN** — especially sharp here, because
  `NSAllowsLocalNetworking` is deliberately enabled for the self-hosted
  Sovereign Tasks connector.

This is not hypothetical for third-party manifests in Phase 3, and the
mitigation has to exist in the schema from the start, because a manifest
format that permits free interpolation cannot later forbid it without
breaking every connector written against it.

## Options considered

### Manifest validation

**A. Zod, with tool parameters kept as opaque JSON Schema (recommended).**
Pure TypeScript, no runtime code generation, types derive from the schema so
the validator and the TS type cannot drift. The `tool.parameters` field stays
raw JSON Schema — validated structurally (is it an object, does it declare
`type`/`properties`) but not interpreted, then handed to `llama.rn` as-is.
Cost: one dependency, and two schema dialects in one file.

**B. Ajv over a JSON Schema definition of the manifest.** One dialect
throughout, and the manifest schema itself becomes publishable for third-party
authors. Rejected as the default: runtime code generation against
third-party-supplied input, and Hermes constraints.

**C. Hand-rolled validator.** No dependency, full control, and every error
message can be written for a connector author. Realistically a few hundred
lines that must be kept in step with the TS types by hand — the same
duplication that `app-info.test.ts` exists to catch elsewhere in this repo,
but larger and without a cheap equality check to lock it.

### Templating

**D. Typed slots with per-position encoding (recommended).** The manifest
declares a fixed `origin` and a path *template made of literal segments and
named slots*. Each slot states where it goes — path segment, query value,
JSON body field, header value — and the runtime encodes per position. No
expression language, no string concatenation, and the origin is not
substitutable at all.

**E. A restricted expression language** (`{{ args.query | urlencode }}`).
Familiar and flexible. It also means shipping an evaluator, and every filter
is a place to get encoding wrong. Flexibility here buys the connector author
convenience and buys the user risk.

**F. Full string interpolation.** Simplest to implement, and unfixable later.
Rejected outright.

## Decisions

- **Tool parameters are JSON Schema**, so grammar-constrained decoding in 2.3
  is free rather than a converter to maintain.
- **The manifest is validated with Zod**; `tool.parameters` is validated
  shallowly and passed through untouched.
- **No expression language.** Typed slots, encoded per position, origin fixed
  and non-substitutable.
- **Credentials are never expressible in a URL** — the schema allows them in
  a header or a body field only, and the validator rejects a manifest that
  places one in `origin`, path, or query.
- **`manifestVersion` is separate from the connector's own `version`**, and
  an unknown `manifestVersion` is rejected rather than parsed best-effort. A
  connector that will not load is a better outcome than one that loads with a
  field silently ignored.
- **Signatures stay detached** (Phase 3), so the signed bytes are exactly the
  manifest file and adding signing later changes nothing about the format.
- **Declared network access is an allowlist of origins**, and the runtime
  refuses any request outside it. This is what makes epic 2.2's per-connector
  grant enforceable rather than advisory.

## Open questions

- **Response mapping.** Turning an HTTP response back into text for the model
  is the mirror of the request problem, and is deliberately not designed here.
  It needs its own pass, including how much of a response body is allowed to
  reach the model's context.
- **Whether the manifest schema is published as JSON Schema for third-party
  authors** even though Zod validates internally. Two artifacts that must
  agree is a drift risk of the kind this repo has already been bitten by.
- **Redirect handling.** A 302 to another origin defeats an origin allowlist
  unless redirects are disabled or re-checked per hop.
- **Timeouts, retries, and response size caps** — absent from the epic's
  field list, and each is a way for a connector to misbehave without ever
  leaving its allowlist.
- **Where manifests live on disk** and whether first-party connectors are
  compiled in or loaded from a file like everything else. Loading them the
  same way is the honest test that the format is genuinely sufficient.

## Notes

The recommendation deliberately trades connector-author convenience for
user safety at every fork. That is the correct default for a product whose
entire pitch is that the network boundary is real — but it is a trade, and
Phase 3 will produce authors who find it restrictive. The place to revisit it
is a specific connector that cannot be expressed, not a general complaint that
templating is limited.
