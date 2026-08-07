---
epic: 9
title: Desktop Shell
status: "✅ Complete"
scope: desktop
---

# Epic: Desktop Shell

> Which technology `apps/desktop` is built on. A one-task epic: once decided,
> everything else desktop needs lives in [Desktop Core Port](core-port.md),
> not here.

## Overview

Per the developer's decision, desktop as a whole is deliberately deferred —
see [Desktop Core Port](core-port.md) for the epic holding the actual
implementation work, sequenced against Phase 1/2/3 separately from this one.
This epic exists only to hold the shell-technology decision itself, and
closes once that decision is recorded.

**Sequencing note:** this epic's own dependency ("Mobile MVP (Phase 1)
shipped") was deliberately pulled forward ahead of task 0.1.20 (store release
setup, the one still-open Phase 1 item) on the developer's explicit
instruction — see [research 0010](../../research/0010-desktop-shell-technology.md#note-on-sequencing).

## Tasks

#### ✅ 9.1 — Desktop shell technology spike

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

**Decided: Tauri v2.** Full reasoning, options considered, and the
alternatives' rejection rationale in
[research 0010](../../research/0010-desktop-shell-technology.md). In short:
`llama.rn` (the mobile inference binding) has no macOS/Windows support and no
signaled path to it, ruling out a React Native desktop shell without giving
up the one thing that would have recommended it (reusing `packages/mobile-ui`
directly); Tauri and Electron both have real, maintained Rust/Node
`llama.cpp` bindings, and Tauri wins on install size and on its default-deny
capabilities model, which is the closest structural match to this project's
existing per-connector permission architecture. Electron's advantage — no
new language, since the stack is TypeScript throughout today — was the
strongest point on its side and is recorded as the real cost of this
decision, not dismissed.

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0001](../../research/0001-concept-and-connector-architecture.md)
- [research 0010](../../research/0010-desktop-shell-technology.md) — the
  shell technology decision (task 9.1)
- [Desktop Core Port](core-port.md) — epic 12, the desktop work this decision
  unblocks
