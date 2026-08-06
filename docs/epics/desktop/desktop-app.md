---
epic: 9
title: Desktop App
status: "📋 Planned"
scope: desktop
---

# Epic: Desktop App

> Secondary, optional desktop client. Sequenced after the mobile MVP proves
> the concept, not built in parallel with it.

## Overview

Per the developer's decision, desktop is deliberately deferred — this epic
exists to hold the eventual work, not to schedule it against Phase 1/2/3.
Shell technology is an open question (see research 0001): Tauri, Electron,
or something else, unresolved.

## Tasks

#### 📋 9.1 — Desktop shell technology spike

**Goal:** Decide the desktop client's technology once there's a reason to
build it.

**Deliverables:**

- A short research pass (candidate: a follow-up research doc) comparing
  Tauri, Electron, and any RN-desktop option against this app's specific
  needs — native `llama.cpp` bindings, Tier 3 OS integration surface,
  install size.

**Dependencies:** Mobile MVP (Phase 1) shipped.

**Review checklist:**

- A decision is recorded (mirroring this repo's research-doc convention)
  before any desktop implementation task starts.

---

#### 📋 9.2 — Desktop port of core inference and connector framework

**Goal:** Bring the Phase 1/2 mobile functionality to desktop.

**Deliverables:**

- Desktop build of the inference engine and connector framework, reusing
  the Connector Framework epic's manifest schema and permission model
  unchanged.

**Dependencies:** Task 9.1, Core Inference & Chat epic, Connector Framework
epic.

**Review checklist:**

- A connector manifest that works on mobile works on desktop without
  modification.

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0001](../../research/0001-concept-and-connector-architecture.md)
