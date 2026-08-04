# Epic: Search Connector

> The Search connector — the first real, non-test consumer of the
> [Connector Framework](connector-framework.md), and the one connector that
> ships in the Phase 1 MVP.

## Status

✅ Done

## Overview

Research 0001 left "exact default search backend" as an explicit open
question, and it stayed open through implementation: a random public SearXNG
instance turns out not to be a safe zero-config default — most disable JSON
output, and at least one documented failure mode returns HTTP 200 with an
HTML body where JSON was expected, which silently breaks rather than failing
cleanly. Tavily is not zero-config either — it needs a paid key from every
user. Neither made "ship a hardcoded default" the right call.

What shipped instead: **one logical Search connector, two interchangeable
providers, configured by the user on first use** — a setup screen (Settings →
Connectors → Search) where the user picks SearXNG (self-hosted or one they
trust, plus its URL) or Tavily (plus their own API key). Nothing is
pre-configured; that is the honest state, not a gap to hide. This absorbed
what task 3.2 originally set out to do (see below) — "configurable endpoint"
and "no safe default exists" turned out to be the same problem.

Both providers back the identical `web_search` tool — the model never knows
or chooses which backend answers it, only the user does, in settings.
Switching providers reuses task 2.2's permission machinery unmodified: a
different provider means a different `permissions.network.origins`, which
`needsRedecision()` already treats as requiring a fresh grant, because it is
one.

## Tasks

#### ✅ 3.1 — Default Search connector

**Goal:** A working Tier 1 connector that lets the model answer questions
needing current web information — redefined during implementation from "one
connector with a hardcoded default" to "one connector, user-configured
provider," per the Overview above.

**Deliverables:**

- Two manifests behind one connector id (`fs.sovereign.search`):
  `buildSearxngManifest(instanceUrl)` (`src/connectors/search/manifest.ts`) —
  a factory, since the origin is user-supplied — and a fully static
  `TAVILY_MANIFEST`, since only its credential varies and that already flows
  through the existing per-connector vault (task 2.2) with no manifest
  change needed.
- A plain-JSON config store (`src/connectors/search/config.ts`) for the
  non-secret choice of provider (+ SearXNG URL), following the same
  secret-vs-not-secret split `grants.ts`/`vault.ts` already established in
  task 2.2.
- `SearchSetupScreen` (`src/settings/screens/`): provider picker, the
  matching field, validated through the real `validateManifest()` (task
  2.1) before anything is saved, so a bad or cleartext URL is rejected the
  same way an author's mistake would be — no special-casing for
  user-supplied config.
- `ConnectorsScreen` and `ModelSessionProvider` both read the live config at
  call time rather than a static list, so "configure once" is immediately
  reflected everywhere without a second data path for Search specifically.

**Dependencies:** Connector Framework epic (2.1–2.5).

**Review checklist:**

- ✅ With the connector permission denied, a search-requiring question is
  answered by explaining the connector isn't enabled, not by silently
  failing or hallucinating an answer.
- ✅ With permission granted, a real search round-trips and the reply cites
  that the Search connector was used.

**The `https`-only rule was deliberately not relaxed for self-hosted
SearXNG.** `NSAllowsLocalNetworking` already anticipates a future connector
(Sovereign Tasks, task 4.2) reaching something on the user's own LAN, which
reads like it might need cleartext HTTP — but self-hosting SearXNG turned out
not to be this project's concern beyond its own testing. The manifest
validator (task 2.1) still requires `https` unconditionally, for every
origin, with no private-address exception. Getting TLS in front of a
self-hosted instance (a reverse proxy, even a self-signed one) is the user's
responsibility, same as standing up the instance itself.

**Verified on-device against a real endpoint, with a real key, not just
mocks — and against a real user's phone, not only a simulator.** A local
SearXNG instance (Docker, JSON output explicitly enabled, TLS terminated via
a local Caddy proxy with its root CA trusted into the simulator) proved a
full round trip end to end: a real request built from the manifest template,
a real response mapped through `textFrom`, a real second-pass answer citing
"via Search (SearXNG)". Tavily's request shape was confirmed against the
real `api.tavily.com` with a deliberately invalid placeholder key — a real
`401`/`403` back (not a network or malformed-request error) proves the
endpoint, method, and `Authorization` header shape are correct without ever
handling the user's actual key, which stayed theirs to enter. The real key
was later entered and exercised by the user themselves on their own physical
iPhone, closing the one gap a simulator harness could not.

**Four real findings from that device verification, none visible from a
green test suite:**

- **An ordinary connector result could exhaust the model's context outright,
  not just produce a worse answer.** `generateWithConnectors`
  (`src/settings/connectorOrchestration.ts`) folded the connector's full
  result into the follow-up prompt with only `response.maxBytes` (task 2.4)
  as a cap — generous enough to protect against a misbehaving endpoint, not
  sized for a 2048-token context. A real SearXNG `results` array was large
  enough on its own to fail generation with "Context is full." Fixed with a
  2000-character budget on the connector's result specifically, independent
  of the network-level cap, which exists for a different threat.
- **`ConnectorsScreen` showed stale "not set up" state after a real, working
  save.** It reads `readSearchConfig()` at render time, and React Navigation
  does not re-render a screen merely because it regained focus after
  `goBack()` — the save had genuinely worked; the screen just never looked
  again. Fixed with `useFocusEffect` triggering the same `refresh()` the
  grant/revoke flow already used. The existing reachability test only
  checked the screen could be navigated to once, not that it stayed correct
  after a full round trip through setup — a real user hit this within
  minutes of using the feature for real.
- **There was no way back into setup once configured**, only grant/revoke on
  whatever was already there — found when a real user needed to fix a
  mistyped key and had nowhere to go. Fixed with a second row, "Change
  provider or key," that reaches `SearchSetupScreen` regardless of current
  grant state.
- **The physical-device build itself surfaced two environment gaps worth
  recording**, neither specific to this task's code but both blocking real
  verification: `xcodebuild -allowProvisioningUpdates` does not reliably
  create a first-time provisioning profile the way Xcode's own GUI does (a
  "Try Again" click in Signing & Capabilities was needed); and a device
  build invoked directly via `xcodebuild` — bypassing `expo run:ios`'s own
  wrapper — needs `REACT_NATIVE_PACKAGER_HOSTNAME` set explicitly to the
  Mac's LAN IP, since a physical device cannot resolve `localhost` to the
  build machine the way a simulator can.

**A fifth finding, real but out of this task's scope: small-model tool-choice
judgment is not just unreliable, it can be actively misleading.** With a
real connector finally in place, on-device testing surfaced cases beyond the
"calls a tool that wasn't needed" cliff task 2.3 already documented — Qwen2.5
0.5B, offered the tool, sometimes answered in its own words instead
(consistent with 2.3's finding) but at least once **claimed to have searched
when it had not**, fabricating an answer with no `tool-call` decision behind
it at all. The UI itself stays honest — no genuine tool call means no "via
Search" tag — but a user who doesn't notice the missing tag is misled by the
model's own words. `tool_choice: 'auto'` asks a small model to make a
judgment call it does not reliably make well, or honestly. Fixing this
means removing the ambiguity rather than tuning around it — most plausibly
an explicit Search mode (alongside Chat/Brainstorm/Fix grammar/Rewrite
tone) where the mode selection itself is the decision, not something asked
of the model at all. Scoped as its own follow-up task, not folded into 3.1.

---

#### ✅ 3.2 — Configurable meta-search endpoint

**Merged into 3.1.** This task's own goal — "avoid hardcoding a single
company's search API, let the endpoint be user-configurable" — is exactly
what 3.1 shipped, for the reason explained in the Overview: neither provider
turned out to be safely zero-config, so "configurable" stopped being an
enhancement over a working default and became the only honest way to ship
this at all. `SearchSetupScreen` **is** this task's deliverable. Nothing
separate remains to build; kept as its own epic task line rather than
deleted, because the id is permanent and the roadmap should show why the
slot closed rather than simply vanish.

---

#### ✅ 3.3 — Explicit Search mode

**Goal:** Remove the ambiguity `tool_choice: 'auto'` leaves in a small
model's hands, per 3.1's fifth finding — a mode where the user's own
selection is the decision, not a judgment call asked of the model at all.

**Deliverables:**

- A new `'search'` mode (`src/chat/modes/modes.ts`), alongside Chat/
  Brainstorm/Fix grammar/Rewrite tone, selected the same way as any other
  mode via the existing mode bar — no new UI surface needed.
- `tool_choice: 'required'` threaded end to end: `routeMessage` (task 2.3)
  gains a caller-specified `toolChoice` on `RouteOptions` (default `'auto'`,
  unchanged for every existing caller); `generateWithConnectors` (task 2.5)
  gains the same on `ConnectorOrchestrationRequest`; `ChatSessionContext`'s
  `GenerateRequest` replaces the old `allowConnectors: boolean` with a
  `connectorMode: 'off' | 'auto' | 'required'` tri-state, since a boolean
  cannot also carry "and skip asking the model" without a fourth, invalid
  combination existing in the type. `ChatScreen` maps mode → `connectorMode`:
  `'plain'` → `'auto'`, `'search'` → `'required'`, everything else → `'off'`.
- Two failure modes specific to `'required'`, handled explicitly rather than
  falling through to `'auto'`'s existing (correct, for `'auto'`) behavior:
  no connector configured at all (a plain instruction to go configure one,
  no generation attempted — forcing a tool call with nothing to call is
  nonsensical) and a model that cannot call tools (a clear "this model can't
  use connectors" message, not the model's own prose about lacking
  real-time access, which in a mode the user explicitly chose *because* they
  wanted a real search would otherwise read as a search that was quietly
  skipped rather than a capability gap).

**Dependencies:** Task 3.1 (the connector this mode forces), task 2.3
(`routeMessage`), task 2.5 (`generateWithConnectors`).

**Review checklist:**

- ✅ Every message sent in Search mode either genuinely calls the connector
  or explains clearly why it could not (not configured, not granted, or the
  model can't call tools) — never a plain, unlabelled answer standing in for
  a search that didn't happen.
- ✅ The other modes are unaffected: Chat still lets the model decide, and
  the writing-assist modes still never reach a connector at all.

**Verified on the user's own physical device** (Metro Fast Refresh — pure
TypeScript, no native change, no rebuild needed): the Search chip appears,
selecting it and asking a question forces a real connector call, and the
banner names the mode the same way a writing-assist mode's does — which
needed its own small fix, since the banner's visibility was keyed off
`mode.systemPrompt` being non-null, a proxy that happened to hold for every
mode that existed before this one. Search has no system prompt at all — its
effect is entirely the forced `connectorMode`, not a model instruction — so
the condition was changed to `mode.id !== DEFAULT_MODE_ID`, the thing the
banner was actually trying to express.

**Left open:** whether `llama.rn`/the underlying grammar engine honors
`tool_choice: 'required'` as strictly as `'auto'` was already confirmed to
work (research 0004's finding) has not been independently stress-tested the
way `'auto'` was across many device runs in tasks 2.3 and 3.1 — the on-device
check above confirms it works for the cases tried, not that it is airtight
against every phrasing. Worth a closer look if a `'required'` request is
ever observed resolving to `answered` rather than `tool-call` or `blocked`.

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)
- [Connector Framework](connector-framework.md)
