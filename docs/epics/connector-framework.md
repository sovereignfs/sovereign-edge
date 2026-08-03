# Epic: Connector Framework

> The manifest schema, permission/consent model, tool-routing, and tiered
> trust runtime that every connector — first-party or, eventually,
> third-party — is built on.

## Status

✅ Done

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

#### ✅ 2.2 — Permission and consent model

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

- ✅ Revoking one connector's permission does not affect any other connector's
  access or stored credentials. Two connectors sharing the same credential
  *key* (`apiToken`) — the case a naive key scheme collides on — and revoking
  one leaves the other's grant and secret intact. Verified by breaking it:
  removing the connector id from the vault's key template failed exactly that
  test and no other.

**Isolation holds by construction, not by discipline.** No exported function
takes a connector id and a key. The only route to a credential is a
`ConnectorVault` handle that closes over its own id and builds every key
itself, so code holding one connector's vault *cannot name* another's token —
not "should not", cannot, without bypassing the module in a way that is
visible in review.

Credentials live in the OS keychain via `expo-secure-store` (iOS keychain,
Android EncryptedSharedPreferences), so they are not readable from a
filesystem dump the way `AsyncStorage` would be. Grants live in plain JSON
instead: they are not secrets, and keeping them readable means a user can
inspect what they agreed to without the app mediating.

**Three decisions worth keeping:**

- **`not-asked` is distinct from `denied`.** Absence of a decision is not
  refusal, and the distinction is what lets the UI avoid re-prompting for
  something already turned down. A dialog that reappears until answered
  "correctly" is coercion, not consent.
- **Revoking destroys credentials, not just the grant.** Otherwise "revoked"
  describes the UI rather than the device, and a later re-grant silently
  reuses a secret the user believed was gone.
- **Granted origins are copied at grant time, not referenced.** A connector
  update that widens `permissions.network.origins` cannot inherit old consent;
  it surfaces as `NEEDS REVIEW`. An update is the natural moment for scope to
  creep, and consent for one set of destinations is not consent for a larger
  one.

Corrupt grant state fails closed — no grants rather than stale ones, so
nothing reaches the network until the user decides again.

**Verified on device, and the check earned its keep.** `expo-secure-store` is
a native module, so this needed a rebuild rather than a Metro reload. The
rebuild silently added `USE_BIOMETRIC` and `USE_FINGERPRINT` to the Release
manifest — invalidating
[docs/network-audit.md](../network-audit.md)'s "exactly one permission" claim
within hours of it being written. Both are blocked now, and the audit carries
a standing instruction to re-check the merged manifest whenever a native
dependency is added.

**Not yet exercised through the UI.** The screen renders its empty state
because no connector exists until task 3.1. Grant and revoke are covered by
tests; the on-device run confirms the app boots with the new native module and
the surface renders. The interactive path gets a real device run when the
Search connector lands.

---

#### ✅ 2.3 — Tool-routing / intent-detection layer

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

- ✅ A request that should trigger a connector call produces valid, schema-
  conformant tool-call output in a controlled test set, not just "it usually
  works."

`routeMessage()` (`src/connectors/routing/`) turns one completion into a
`RoutingDecision`: `answered` (no tool needed), `tool-call` (a permitted
connector matched), `blocked` (a tool was called but can't be honoured —
`no-connector`, `not-permitted`, or `malformed`), or `unsupported` (the
loaded model's chat template can't emit tool calls at all —
`EngineInfo.toolCapable`, read from `chatTemplates.jinja.defaultCaps.tools`
per research 0004). One completion call does double duty: the same request
that offers tools either returns a chat answer or a tool call, rather than a
separate classifier guessing intent ahead of generation.

**No argument validator, by design.** `tool.parameters` is JSON Schema
specifically so `llama.rn` can convert it into a decoding grammar — the
model's output is constrained to be valid rather than merely likely to be.
`routeMessage` trusts that guarantee and only `JSON.parse`s the arguments,
rather than re-validating them against the schema. The `malformed` outcome
exists for the same reason 2.1's validator exists at all: the arguments are
still model output steered by whatever the user pasted into chat, and this
repo treats that as untrusted regardless of what the decoding grammar is
supposed to guarantee.

**Capability gate is silent, not user-facing.** When `toolCapable` is false,
no `tools` are offered and the model just answers normally — there is no
`blocked` case to report, because nothing was ever offered. The `blocked`
cases are for the two failures that can only happen once a tool *was*
offered and something after that failed. Whether `unsupported` gets any UI
treatment is left to whichever task wires this into `ChatScreen` (2.5, most
likely) — 2.3 has no chat-surface deliverable.

**Verified on-device against a real model, and it surfaced a real
limitation.** Qwen2.5-0.5B-Instruct correctly emitted a grammar-constrained
call naming the Search fixture's actual tool (`web_search`) for a
search-shaped prompt — confirming the mechanism this task depends on. But
the same model also called `web_search` for "What is 12 plus 30?", which
needs no connector at all. `tool_choice: 'auto'` is not reliably choosing
"just answer" on a model this small — a routing-layer concern in the sense
that whoever executes tool calls (2.4) or exposes a real connector (3.1)
should not assume "the model called a tool" means "the model needed to."
Worth a closer look — a different `tool_choice`, an explicit intent gate
before offering tools, or simply not offering tools on models this size —
when a connector is actually reachable and an unnecessary network round-trip
stops being a hypothetical.

---

#### ✅ 2.4 — Connector runtime host

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

- ✅ A Tier 1 connector's manifest alone (no connector-specific code) is
  enough to execute a real request/response round trip.

`executeConnectorCall()` (`src/connectors/runtime/`) maps a `RoutingDecision`
of kind `tool-call` into an HTTP request per `request`, and the response back
into `text` per `response`, returning a typed `ExecutionResult` — `ok: true`
or `ok: false` with a specific `reason` (`not-permitted`,
`missing-credential`, `invalid-arguments`, `network-error`, `redirected`,
`http-error`, `response-too-large`, `malformed-response`), same shape task
2.3 established for `RoutingDecision`: a switch for the caller, not a
try/catch.

**`isAllowed()` is re-checked here, not just trusted from routing.** 2.2's own
doc comment already called this "the single question the runtime asks before
any request" — this function does not assume its caller already asked it.

**Redirects are never followed.** `fetch(url, { redirect: 'manual' })`, and
any 3xx (or an opaque redirect response) is a hard `redirected` failure.
Research 0004 flagged this as an open question — a redirect to another origin
defeats the origin allowlist that makes 2.2's grant enforceable — and this
task is where it got settled rather than deferred again.

**No manifest field for timeout**, so it's a runtime constant (15s via
`AbortController`) rather than connector-configurable, matching the epic's
own field list. No retries: one clean failure is more honest than silently
repeating a request the user never saw happen once.

**`response.maxBytes` is enforced against the actual decoded byte length, not
just `Content-Length`** — a header that can be absent or simply wrong. A
response is rejected before `JSON.parse` either way it fails the cap.

**Verified on-device against a real endpoint, not just mocks** — the round
trip the review checklist asks for is a device claim, same as 2.3's. Hitting
httpbin.org from the iOS simulator: a GET request built from a manifest
template and args (`?q=hello-from-sovereign-edge`) echoed back and mapped
through `textFrom` correctly; a POST with a JSON body round-tripped the same
way; and a real 302 from `httpbin.org/redirect-to` was refused exactly as
designed (`{ ok: false, reason: 'redirected' }`) — resolving, on a real
device rather than by reading the spec, whether Expo's `fetch` reports a
manual redirect as an opaque response or a plain 3xx status (it can do either
depending on path, which is why the runtime checks both).

**A pre-existing conflict with task 1.5's offline tripwire, found by that same
device run.** `src/connectors/runtime/execute.ts` is the first code in this
repo to call `fetch` directly, and `armOfflineTripwire()`
(`src/chat/session/offlineTripwire.ts`) replaced the global for the entire
process in development builds — not scoped to `src/chat/` — so every call
from the runtime host threw the tripwire's own violation error, whose message
already (and, until now, only aspirationally) said "network access belongs in
`src/connectors/`, behind an explicit per-connector grant." Nothing had
exercised that claim before a connector runtime existed to call `fetch`.
Fixed with `allowNetworkForConnector()`, a narrow, named, importable escape
hatch added to the same file: the only legitimate call site has to name
itself explicitly, which is a stronger guarantee than the blanket replacement
it replaces, not a weaker one — the same "not 'should not', cannot without it
being visible in review" property 2.2 gives credential isolation. `jest.setup.js`'s
own network-in-tests guard is untouched: the escape hatch reaches through to
whatever `fetch` was originally there, which in Jest is still that throwing
stub.

---

#### ✅ 2.5 — In-chat connector provenance

**Goal:** Make it visible in the UI which connector (if any) answered a given
message — per CONCEPT.md's "always show which trust tier is active."

**Deliverables:**

- A visible marker in chat distinguishing a fully-offline reply from one that
  used a specific named connector.

**Dependencies:** Task 2.4, Task 1.3 (chat UI).

**Review checklist:**

- ✅ A user can tell, without opening settings, whether a given reply touched
  the network and which connector did it.

The marker itself needed no new UI work — `ChatBubble`'s `connector?: string`
prop already existed, fully implemented and tested, from earlier design-system
work; it had simply never been passed from `ChatScreen`. The actual task was
the orchestration underneath: `generateWithConnectors()`
(`src/settings/connectorOrchestration.ts`) is the one place `RoutingDecision`
(2.3) and `ExecutionResult` (2.4) meet a user-facing reply — routes a message,
executes a connector if one was called, maps every `blocked` / `ok: false`
outcome to a short, specific, honest fallback string (never a generic
"something went wrong"), and returns `{ text, connector }` for `ChatScreen` to
render.

**Gated to plain Chat mode only.** `GenerateRequest` gained `allowConnectors`,
set by `ChatScreen` to `modeId === 'plain'`. The writing-assist modes are
documented as transformations of the text handed to them, not conversations
— offering a connector to "Fix grammar" is a category error before even
asking whether one is installed, and it also sidesteps 2.3's own device
finding that a small model offered a tool will sometimes call it when it
plainly should not have.

**No shared connector registry.** `INSTALLED: ConnectorManifest[] = []` in
`ModelSessionProvider.tsx` follows the exact placeholder pattern
`ConnectorsScreen.tsx` already established for task 2.2 — empty until 3.1,
local rather than promoted to a shared module ahead of the one connector that
would need it.

**Three real bugs, all found on-device, none caught by unit tests** — every
suite was green before any of these were discovered, which is the specific
thing this project's own verification discipline exists to catch:

1. **`routeMessage`'s `unsupported` branch generated nothing.** It returned
   immediately without ever calling `engine.generate()` — a tool-incapable
   model produced no reply at all, not a silent-but-normal one as designed.
   Fixed to always generate when nothing can be offered, whether that's
   because no connector exists (`answered`) or the model can't call tools
   (`unsupported`); `RoutingDecision`'s `unsupported` variant now carries
   `text`.
2. **Tool-call syntax leaked into the visible chat.** `routeMessage` streamed
   the tool-decision completion's raw tokens live via `onToken`. On a real
   device, Qwen2.5-0.5B emitted its literal `<tool_call>{"name":"web_search",
   ...}</tool_call>` block as part of its raw text stream before that syntax
   was recognised as a tool call — it appeared in the chat bubble ahead of
   the real answer. Fixed by no longer forwarding `onToken` into that one
   completion; its `result.text` is flushed to the caller in a single call,
   and only once the outcome is known to be a plain answer — never for a
   `tool-call` outcome, whose raw text was never meant to be seen at all.
3. **A `blocked` fallback rendered as a permanently empty bubble.**
   `ChatScreen` built visible message content purely by accumulating
   `onToken` calls. A `blocked` reply resolves with real, specific text (e.g.
   "hasn't been granted access") but streams zero tokens, since it is
   app-generated text, not model output. Fixed by also setting content from
   the resolved `generate()` result, not only from streamed tokens.

All three were verified fixed against a real device, using a temporary
synthetic connector (an httpbin.org-backed manifest, fully reverted after
use) — the same device-first pattern 2.3 and 2.4 already established, and
this task's own reminder that a green suite is not the same claim as "the
feature works."

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)

## Cross-references

- The Search connector (epic 3) and Sovereign Tasks connector (epic 4) are
  the first consumers of this framework.
- Epic 5 (Connector Store & SDK) reuses this framework's manifest schema
  unchanged when opening it to third parties.
