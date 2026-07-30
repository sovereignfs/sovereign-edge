# Epic: Search Connector

> The default, built-in Tier 1 connector for scenario 2 — web search — the
> one connector that ships in the Phase 1 MVP.

## Status

📋 Planned

## Overview

The first real consumer of the [Connector Framework](connector-framework.md).
Ships hardcoded/bundled in Phase 1, but expressed in the exact Tier 1
manifest shape a downloadable third-party connector will use later — no
special-casing.

Defaults toward a configurable meta-search endpoint (SearXNG-style) rather
than one company's API, aligned with `sovereign-os`'s independent ADR-0004
decision (see research 0001).

## Tasks

#### 📋 3.1 — Default Search connector

**Goal:** A working Tier 1 connector that lets the model answer questions
needing current web information.

**Deliverables:**

- Search connector manifest (per epic 2's schema): tool schema for
  `web.search`, request/response templates for a meta-search HTTP API.
- Permission-gated per the Connector Framework — disabled until the user
  explicitly grants network access to this specific connector.
- Result summarization back into the chat, with provenance shown (epic 2.5).

**Dependencies:** Connector Framework epic (2.1–2.4).

**Review checklist:**

- With the connector permission denied, a search-requiring question is
  answered by explaining the connector isn't enabled, not by silently
  failing or hallucinating an answer.
- With permission granted, a real search round-trips and the reply cites
  that the Search connector was used.

---

#### 📋 3.2 — Configurable meta-search endpoint

**Goal:** Avoid hardcoding a single company's search API — let the endpoint
be user-configurable, consistent with the wider ecosystem's self-hosting
bent.

**Deliverables:**

- Settings field for a custom SearXNG (or compatible) instance URL.
- A sane default endpoint for users who don't want to self-host one (exact
  choice still an open question — see research 0001).

**Dependencies:** Task 3.1.

**Review checklist:**

- Pointing the connector at a different, user-supplied SearXNG-compatible
  endpoint works without a code change.

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)
- [Connector Framework](connector-framework.md)
