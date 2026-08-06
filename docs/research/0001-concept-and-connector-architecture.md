---
id: 1
title: "Sovereign Edge: concept, positioning, and connector architecture"
status: decided
date: "July 2026"
author: "Claude Code (session with the developer)"
scope: shared
summary: "Whole project — positioning, inference engine, client framework, the agent/connector (plugin) architecture, monetization model, phasing"
---

# Research 0001 — Sovereign Edge: concept, positioning, and connector architecture

**Related:** none yet — first research doc for this repo. See root
[CONCEPT.md](../../CONCEPT.md) for the resulting design and
[ROADMAP.md](../../ROADMAP.md) for the phased task index.

---

## Question

Should the `sovereignfs` ecosystem build a privacy-first, fully offline
on-device AI companion app (working name "Sovereign Edge") as an alternative
to Google's AI Edge Gallery and the third-party OGAM (Off-Grid AI Mobile)
project — and if so, what positioning, technical architecture, and phased
rollout let it start as a minimal MVP while evolving into an open,
third-party-extensible connector ecosystem without requiring a rework later?

This is a **new, standalone product** in the `sovereignfs` ecosystem —
unrelated to the already-planned `sovereign-mobile` (a Capacitor shell that
loads a user's self-hosted `sovereign` instance in a WebView). Sovereign Edge
has no runtime dependency on `sovereign` and works with zero knowledge that
`sovereign` exists.

## Findings

### Competitive landscape

- **Google AI Edge Gallery** — a Google tech demo for on-device model
  inference. Its "on-device, private" claim requires trusting Google's closed
  pipeline; nothing about it is independently verifiable, which is a
  non-starter for a genuinely privacy-conscious user.
- **OGAM (Off-Grid AI Mobile)** — <https://ited.edu.kg/off-grid-ai/OGAM>. Does
  on-device GGUF inference (Qwen 3, Llama 3.2, Gemma 3, Phi-4), image
  generation (Stable Diffusion), vision, Whisper speech-to-text, and
  function-calling/tool-use. Not fully open — a freemium app (Pro tier: $69
  lifetime / $49/yr) that gates "agentic" actions (Calendar, email, and MCP
  servers such as Linear/Notion/GitHub) behind payment and behind **cloud** MCP
  servers, which undercuts its own "off-grid" framing. Android + iOS +
  macOS-via-iPad-compatibility only; no native Windows/Linux desktop story.
  The developer's own trial hit a stuck model download and found the UI
  bulkier than needed, with features not personally relevant.

### Prior art for the technical stack

- **PocketPal AI** — open source, React Native + `llama.rn` (a maintained RN
  binding for `llama.cpp`). Validates RN as a lean, proven stack for on-device
  GGUF chat apps, minus any agentic layer. Closest reference for "not bulky."
- **`sovereign-os` ADR-0004** (confluence/entities/sovereign-os.md) already
  commits, independently, to "a provider-neutral local AI assistant plus
  opt-in web search via a self-hosted SearXNG instance — no cloud LLM
  dependency by default." This validates defaulting Sovereign Edge's search
  connector to a SearXNG-style, user-configurable meta-search endpoint rather
  than hardcoding one company's search API.

### Platform constraints on a third-party plugin model

- `sovereign`'s plugin system (the closest internal precedent) works because
  plugins are trusted Next.js code running inside a self-hosted server the
  operator controls, with only an ESLint-enforced import boundary
  (`docs/plugin-development.md` in `confluence/concepts/`).
- That model does not transfer to a mobile app store binary. **iOS forbids
  dynamically loading native code at runtime** outside the reviewed app
  binary — arbitrary third-party "plugins" cannot ship native modules the way
  `sovereign` plugins ship server code. Letting arbitrary third-party code run
  inside a privacy-first AI app with device permissions is also a much larger
  trust problem than an ESLint rule.
- Deep OS integration (Calendar, Contacts, Shortcuts/App Intents on iOS, App
  Actions on Android) is only reachable through first-party native modules
  reviewed on the app's own release cycle — there is no sanctioned way today
  for a third party to drop in that kind of native capability.

## Options considered

### A. Sovereign-style plugin model (arbitrary code, same trust level as `sovereign`)

Rejected. Doesn't fit iOS's no-dynamic-native-code constraint, and creates an
outsized trust/security surface for an app whose entire value proposition is
privacy.

### B. No third-party plugin ecosystem — built-in features only

Rejected. Forecloses "anyone should be able to develop plugins" and the paid-
plugin monetization model the developer wants.

### C. Tiered connector model, scoped to what mobile app stores actually allow (recommended)

Three tiers, by how much trust each requires:

1. **Tier 1 — declarative connectors.** A manifest describes the tool schema
   the LLM sees, an endpoint (user- or author-configured), an auth method
   (token stored in the OS keychain, scoped per-connector), and
   request/response templates mapping the LLM's structured tool-call into an
   HTTP call and back. No executable code ships at all — same idea as OpenAI
   "Actions" or a Zapier app definition. Open to any third-party developer
   from day one of Phase 3, since there is no code to sandbox.
2. **Tier 2 — sandboxed transform scripts.** For connectors needing logic
   beyond request/response templating: a small script running in a
   capability-restricted JS engine (no ambient filesystem/network/device
   access beyond what the host explicitly injects as call parameters). Same
   threat model as a browser extension's content script.
3. **Tier 3 — deep OS integration.** Anything needing real native modules
   (Shortcuts/App Intents, direct Contacts/Calendar writes) ships inside the
   app's own binary, first-party only, reviewed on the normal release cycle.
   Not opened to third parties until/unless a native-plugin-loading story
   survives app store review — which mostly doesn't exist today.

This is the option that lets "anyone can build a plugin" be true in practice,
without ever trusting arbitrary native code on someone's phone.

## Recommendation

Adopt Option C. Build the connector interface (manifest shape: tool
schema, permission scope, request/response mapping) as the foundation from
Phase 1 onward — even while only one connector exists and it ships hardcoded
— so that opening it to third parties in Phase 3 is "load this same shape
from an external registry," not a rewrite of the tool-routing/permission core.

## Decisions

These were resolved directly by the developer during this brainstorm, not
left as open research questions:

- **Task-handoff mechanism:** direct integration, not delegate-to-native-app
  handoff. A connector (e.g. Sovereign Tasks) writes directly via its own
  stored, permissioned credentials, rather than opening another app's UI for
  the user to confirm inside.
- **Sandboxing definition:** the chat/model/memory layers are 100% offline by
  design — no network code path exists there at all. Any call to the outside
  world happens only through an explicitly permission-granted connector, and
  permission is scoped per-connector (granting the Search connector network
  access does not grant Sovereign Tasks connector access, and vice versa).
- **Search connector:** defaults toward a configurable meta-search endpoint
  (SearXNG-style — self-hosted, no single company in the loop), aligned with
  `sovereign-os`'s independent ADR-0004 decision. Exact default
  endpoint/provider is an open question below.
- **Sovereign Tasks connector:** calls the user's self-hosted `sovereign`
  instance's task API directly over HTTPS (instance URL + API token,
  configured once), regardless of whether a native Sovereign app happens to
  be installed on the same device. This avoids fragile inter-app IPC/URL-
  scheme plumbing entirely, and still only ever touches infrastructure the
  user owns.
- **Inference engine:** `llama.cpp`/GGUF via `llama.rn`, matching PocketPal
  AI's proven stack.
- **Client framework and platforms:** React Native, targeting **both iOS and
  Android from Phase 1** — the native modules Tier 3 connectors eventually
  need are per-platform regardless of RN vs. fully-native, so RN costs
  nothing extra on that front.
- **Monetization:** the core app plus a baseline set of first-party
  connectors stay free forever. Paid connectors are sold via platform IAP on
  mobile (Apple/Google require their in-app purchase system for unlocking
  digital features — a direct-payment paywall inside the binary risks
  rejection), and via direct sale on desktop, where there is no app-store
  payment requirement, mirroring `sovereign`'s own entitlement-token
  monetization model (RFC 0003 in the `sovereign` repo).
- **Ecosystem relationship:** fully standalone — no runtime dependency on
  `sovereign`, no shared codebase. May reuse Sovereign's visual identity and
  branding.
- **Desktop:** secondary and optional, sequenced after the mobile MVP proves
  the concept, not built in parallel from day one.
- **Phasing (build a foundation once, widen without rework):**
  1. **Phase 1 (MVP/POC):** chat layer only, plus one built-in connector
     (Search), both platforms.
  2. **Phase 2:** fully agentic layer with default connectors (adds Sovereign
     Tasks and connector management UI), still first-party only.
  3. **Phase 3:** the connector layer opens fully — SDK, plugin template,
     examples, public registry, in-app store, monetization rails.

## Open questions

- **Desktop shell technology** (Tauri vs. Electron vs. something else) — not
  decided; revisit once the mobile MVP has shipped.
- **Tier 2 sandboxed-script runtime** (an embedded Hermes isolate vs. QuickJS
  vs. WASM) — needs a spike once a real Tier 2 connector use case exists;
  none of the Phase 1/2 default connectors currently need more than Tier 1
  request/response templating.
- **Final product name/branding.** "Sovereign Edge" is a working codename
  tied to this repo's directory name (`sovereign-edge`), not a decided
  consumer-facing name.
- **Whether Tier 3 ever opens to third parties**, and by what mechanism (e.g.
  discovering OS-level App Intents/App Actions that *other* apps expose,
  rather than ever loading third-party native code directly into this app).
- **Default model catalog for the MVP** — which GGUF models/quantizations to
  bundle or recommend (Gemma, Qwen, Phi, Llama variants) is unresolved; needs
  its own pass once on-device performance testing starts.
- **Exact default search backend** — a specific SearXNG instance/hosting
  story, or a different privacy-respecting meta-search API — not yet chosen.

## Next steps

Given how much of this was already decided directly in conversation, this
graduates straight into planning rather than needing an intermediate RFC
stage: see [CONCEPT.md](../../CONCEPT.md) for the resulting product concept
and [ROADMAP.md](../../ROADMAP.md) plus [docs/epics/](../epics/) for the
phased task breakdown. If this project later adopts an RFC layer (mirroring
`sovereign`'s `docs/rfcs/`), the connector manifest schema (Tier 1's
endpoint/auth/request/response shape) is the first thing that should be
formalized that way, before Phase 3 implementation begins.
