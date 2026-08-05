# Epic: Calendar Connector

> A first-party Tier 3 connector letting the model create, update, delete,
> and query the user's own on-device calendar.

## Status

📋 Planned

## Overview

The first connector that reaches an on-device OS capability rather than the
network — a **Tier 3** connector per the Connector Framework's own original
three-tier design (research 0001), not Tier 1 like Search and Sovereign
Tasks. Blocked on epic [2](connector-framework.md)'s task 2.6 (Tier 3
scaffolding), which this epic is the first real consumer of.

Full findings, options, and the reasoning behind this epic's scope live in
[research 0005](../research/0005-calendar-connector.md) — this file states
the decided scope as tasks, that doc keeps the *why*.

## Tasks

#### 📋 10.1 — Calendar connector

**Goal:** Let the model create, update, delete, and query events on the
user's own device calendar, via `expo-calendar`.

**Deliverables:**

- A Tier 3 connector manifest (per task 2.6's schema) declaring four tools:
  `calendar.create_event`, `calendar.update_event`, `calendar.delete_event`,
  `calendar.query_events`.
- Reminders are modeled as an alert offset on a created event, not a
  separate API surface — the one interpretation of "reminders" that behaves
  identically on iOS and Android (research 0005's findings: iOS EventKit has
  a genuinely separate Reminders store; Android has no equivalent at all).
- MVP scope is deliberately narrow: single, non-recurring, timezone-naive
  events. Recurrence, timezone handling, and all-day events are explicitly
  out of scope for this task.
- New events are written to a fixed default/primary calendar for MVP — see
  Open Questions below for the eventual calendar-picker flow.

**Dependencies:** Task 2.6 (Tier 3 scaffolding).

**Review checklist:**

- Creating an event via chat results in a real event appearing in the
  device's own Calendar app, on both platforms.
- Querying "what's on my calendar" returns events actually present on the
  device, not a stale or cached view.
- Deleting or updating an event via chat is reflected in the Calendar app
  immediately.
- Revoking this connector's permission does not affect any other
  connector's permission (Search, Sovereign Tasks) or vice versa — the same
  bar task 2.2 already set for Tier 1 connectors, now proven for Tier 3.

**Open questions carried from research 0005:**

- Which calendar (of possibly several on a device) new events are written
  to — MVP defaults to the primary/default calendar; a one-time
  calendar-picker setup step (mirroring epic 4.2's instance/token setup
  pattern) is a plausible fast-follow, not yet scoped as its own task.
- `expo-calendar`'s compatibility with the installed Expo SDK 57 / RN 0.86
  toolchain needs confirming at implementation time, not assumed here.
- iOS calendar permission has full-access and write-only tiers since iOS 17
  (`NSCalendarsFullAccessUsageDescription` /
  `NSCalendarsWriteOnlyAccessUsageDescription`); `query_events` requires the
  full-access tier, which task 10.1 should request explicitly rather than
  defaulting to write-only and having queries silently fail.

## Related Docs

- [research 0001](../research/0001-concept-and-connector-architecture.md)
- [research 0005](../research/0005-calendar-connector.md)
- [Connector Framework](connector-framework.md) (task 2.6, the Tier 3
  scaffolding this epic depends on)

## Cross-references

- Shares its Tier 3 dependency (task 2.6) with the
  [Device connector](device-connector.md) (epic 11).
- Mirrors the Sovereign Tasks connector's (epic 4) "direct integration, not
  delegation" pattern — this connector writes to the calendar itself, it
  does not hand off to another app's UI.
