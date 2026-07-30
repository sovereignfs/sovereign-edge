# Epic: Sovereign Tasks Connector

> The default Phase 2 connector for scenario 3 — creating a task on a user's
> own self-hosted `sovereign` instance, via a direct API call.

## Status

📋 Planned

## Overview

Second consumer of the [Connector Framework](connector-framework.md), and the
one deliberate point of optional overlap with the wider `sovereignfs`
ecosystem — entirely opt-in, and the app has zero dependency on `sovereign`
existing. Per research 0001's decision, this calls the user's self-hosted
`sovereign` instance's task API **directly over HTTPS**, whether or not a
native Sovereign app happens to be installed on the same device — there is no
on-device app-to-app IPC involved.

## Tasks

#### 📋 4.1 — Sovereign Tasks connector

**Goal:** Let the model create a task in a user's own `sovereign` instance on
request.

**Deliverables:**

- Connector manifest (per epic 2's schema) for a `tasks.create` tool,
  targeting `sovereign`'s Tasks plugin API.
- Direct integration, not delegation: the connector holds its own stored,
  permissioned API token and writes the task itself, rather than opening a
  Sovereign app UI for the user to confirm in.
- Permission-gated per the Connector Framework — separate grant from the
  Search connector.

**Dependencies:** Connector Framework epic (2.1–2.4).

**Review checklist:**

- Creating a task via chat results in a real task appearing in the user's
  `sovereign` instance's Tasks plugin.
- Revoking this connector's permission does not affect the Search
  connector's permission or vice versa.

---

#### 📋 4.2 — Instance URL and API token setup flow

**Goal:** A one-time setup flow for pointing this connector at the user's
own instance.

**Deliverables:**

- Settings flow: paste instance URL, generate/paste an API token (generated
  in Sovereign's own settings — this task does not include building that
  token-generation UI inside `sovereign` itself, only consuming it here).
- Clear error states for an unreachable instance, invalid token, or missing
  Tasks plugin.

**Dependencies:** Task 4.1.

**Review checklist:**

- An invalid token or unreachable instance produces a clear, actionable
  error rather than a silent failure.

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)
- [Connector Framework](connector-framework.md)

## Cross-references

- Depends on `sovereign`'s own Tasks plugin API (`sovereign-tasks`) and
  whatever API-token mechanism `sovereign` exposes for external clients —
  see `sovereign`'s own docs for that surface; this repo does not own or
  duplicate it.
