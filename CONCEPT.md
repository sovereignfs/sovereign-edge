# Sovereign Edge

_(Working codename, tied to this repo's directory name — not yet a decided
consumer-facing product name. See
[research 0001](docs/research/0001-concept-and-connector-architecture.md#open-questions).)_

## Concept Paper (Draft v0.1)

### Vision

Sovereign Edge is a privacy-first, fully offline AI companion for phones —
and, later, desktops. Users download a small local language model (Gemma,
Qwen, Phi, or similar) straight to their own device and talk to it with
**zero network requests of any kind** from the chat itself. Nothing about
that promise depends on trusting a vendor's word for it — the chat and
inference path has no network code in it at all.

On top of that offline core sits an optional, explicitly-permissioned
**connector layer**: a small set of agents that can reach outside the device
— to search the web, or create a task in the user's own self-hosted
software — but only once the user has granted that specific connector that
specific permission. Nothing reaches outside the sandbox by default, and
each connector's reach is scoped to exactly what it was granted, not a
blanket "this app can use the network" toggle.

### The Problem

Two projects already do "chat with a local LLM offline," and neither answers
the actual problem:

- **Google's AI Edge Gallery** asks a privacy-conscious user to trust
  Google's closed pipeline that it really doesn't phone home — an
  unverifiable claim from the one company most associated with data
  extraction, which no one who takes privacy seriously should have to accept
  on faith.
- **OGAM (Off-Grid AI)** gets the on-device chat part right, but its
  "agentic" tier is paywalled ($69 lifetime / $49/yr) and routes through
  **cloud** MCP servers (Notion, Linear, GitHub) — which quietly
  reintroduces the exact cloud dependency an "off-grid" tool is supposed to
  remove. It's also bulkier than it needs to be, with a lot of surface area
  most users don't need, and its model downloads don't always work.

There is no option today that is both genuinely, verifiably offline for its
core function, and free of a company payment gate or cloud dependency for
the parts of it that reach outside the device.

### The Solution

Sovereign Edge separates the product into two trust tiers that the user can
always see:

1. **Chat** — fully local, fully offline, always. Writing help, brainstorming,
   grammar fixes, drafting — the model runs entirely on-device.
2. **Connectors** — a small, explicit, permissioned layer. When a task needs
   something outside the device — searching the web, creating a task in the
   user's own self-hosted Sovereign instance — a specific connector handles
   it, only once granted that specific permission, and the app is
   transparent in the UI about which connector was used for which reply.

The core app and a baseline set of connectors are free forever. The
connector layer is also where the product opens up: **anyone can develop and
publish a connector**, and some can be sold.

### Core Principles

**User ownership.** The model, the chat history, and the memory layer live on
the user's device. Nothing is uploaded anywhere by default.

**Privacy first, provably.** No telemetry, no accounts, no cloud fallback for
the core chat function — not "trust us," but true by construction, since
there's no network code in that path to begin with.

**Explicit, scoped permission for anything that leaves the device.** Every
connector requests its own permission, separately revocable, and the UI
always shows which connector (if any) touched the network for a given reply.

**Open connector ecosystem, sized to what's actually safe.** "Anyone can
build a plugin" doesn't mean "anyone can run arbitrary native code inside
this app" — see [Platform Architecture](#platform-architecture) below for why
that distinction matters and how it's structured.

**Free core, forever.** The chat app and a baseline set of connectors never
require payment. Monetization lives entirely in the optional connector
layer.

**Build once, widen without rework.** The connector interface is designed the
same way from day one whether it's serving one hardcoded connector or a
thousand downloaded ones — see [Phasing](#phasing-build-a-foundation-that-evolves-without-friction).

### Platform Architecture

Two layers:

#### Core: local inference

`llama.cpp`/GGUF via `llama.rn` (the same combination used by the open-source
PocketPal AI), wrapped in a React Native app targeting iOS and Android from
day one. A model manager lets the user pick and download a small GGUF model
(Gemma/Qwen/Phi-class). Nothing in this layer ever makes a network call.

#### Connectors: a tiered trust model

Mobile app stores don't allow the kind of "arbitrary third-party code running
inside your app" model that `sovereign`'s own web-based plugin system uses
(iOS forbids dynamically loading native code at runtime outside the reviewed
binary). So the connector layer is split by how much trust each tier
actually requires:

- **Tier 1 — declarative connectors.** A manifest: the tool schema the model
  sees, an endpoint, an auth method (a token in the OS keychain, scoped per
  connector), and request/response templates. No code ships at all. This
  covers the large majority of real connectors — search, task creation,
  most REST-API integrations — and is safe to open to any third-party
  developer, because there's nothing to sandbox.
- **Tier 2 — sandboxed transform scripts.** For a connector that needs real
  logic beyond request/response templating: a small script running in a
  capability-restricted engine, with no ambient device/network/filesystem
  access beyond what the host explicitly hands it.
- **Tier 3 — deep OS integration.** Anything needing genuine native modules
  (Shortcuts/App Intents, direct Calendar/Contacts access) ships inside the
  app's own binary, first-party only, on the normal release cycle. Not
  opened to third parties unless a native-plugin-loading story that survives
  app store review emerges later.

### Business Philosophy

The core app is free forever — not a trial, not a limited tier. Revenue comes
from optional paid connectors: on mobile through platform in-app purchase
(required by Apple/Google for unlocking digital features inside an app
binary), and on desktop through direct sale, the same way `sovereign` sells
plugin entitlements today. User data is never the product, and never part of
the business model — consistent with the wider `sovereignfs` ecosystem's
"digital self-determination" stance.

### Platform Philosophy

Mobile-first: iOS and Android together from Phase 1, via React Native — the
native modules Tier 3 connectors eventually need are per-platform regardless
of client framework, so building both from the start costs nothing extra.
Desktop is secondary and optional, picked up only once the mobile MVP has
proven the concept.

### Non-Goals

Sovereign Edge is not:

- A cloud AI assistant, or dependent on one for its core function
- A general-purpose autonomous "computer use" agent — the connector layer is
  task handoff and communication, not open-ended multi-step autonomy
- A replacement for `sovereign` or any dependency of it — fully standalone
- A data collection platform, or funded by one
- A mandatory subscription — the core product is free forever

### Initial MVP

Phase 1 is intentionally small: the offline chat layer (writing help,
brainstorming, drafting), plus one built-in connector — Search — so the
"explicit-permission agent reaches outside, everything else stays local"
promise is proven end-to-end, on both iOS and Android. No connector store, no
third-party anything, no monetization yet.

### Phasing: build a foundation that evolves without friction

1. **Phase 1 — MVP/POC.** Chat layer + a hardcoded Search connector, already
   built internally to the Tier 1 connector shape even though nothing is yet
   downloadable — so opening it up later doesn't require rebuilding the
   tool-routing/permission core.
2. **Phase 2 — full agentic layer, default connectors.** Add the Sovereign
   Tasks connector (talks directly to the user's own self-hosted `sovereign`
   instance) and real connector-management UI (per-connector permission
   toggles, in-chat provenance of which connector answered).
3. **Phase 3 — open connector ecosystem.** Publish the connector SDK, a
   plugin template, first-party examples, a public registry, and an in-app
   connector store. Monetization (IAP on mobile, direct sale on desktop)
   turns on here.

Desktop support is picked up after Phase 1 mobile ships, not in parallel with
it.

### Long-Term Vision

Sovereign Edge aims to be the answer to "I want a genuinely private AI on my
phone" that doesn't ask for trust it can't earn structurally, and doesn't
quietly reintroduce a cloud dependency the moment it needs to act on the
user's behalf. The connector ecosystem is where it grows — safely, at the
trust level mobile platforms actually allow, open to any developer willing
to build within it.
