---
id: 5
title: "Calendar connector: scope and platform fit"
status: decided
date: "August 2026"
author: "Claude Code (session with the developer)"
scope: mobile
summary: "Candidate Phase 2+ connector — let the model create, update, delete, and query calendar events, and set reminders"
---

# Research 0005 — Calendar connector: scope and platform fit

**Related:** [Connector Framework](../epics/mobile/connector-framework.md)
(epics 2.1–2.5, the permission/manifest machinery this would plug into),
[Sovereign Tasks connector](0006-files-document-summarization.md)-adjacent in
spirit (a second "direct action" connector), see also
[0009](0009-device-connector.md) for the same permission-model question
applied to a different local capability

---

## Question

Of the phone capabilities surveyed in conversation, Calendar was picked as the
strongest first candidate for a new connector. What does `expo-calendar`
actually give us on each platform, and what does "set reminders" mean once
iOS and Android diverge?

## Findings

- `expo-calendar` is the natural module — same ecosystem this project already
  standardises on (research 0002). It is not currently a dependency; adding
  it is new work, not a config change.
- **iOS (EventKit)** exposes two distinct stores: Calendar events, and a
  separate Reminders list (`EKReminder` — due date, priority, completion
  state). These are genuinely different APIs, not two views of the same data.
- **Android (`CalendarContract`)** only has Calendar events. There is no
  OS-level Reminders list equivalent to iOS's — reminders-as-a-concept live
  in individual apps (Google Keep, Assistant), not a public platform API.
- Permissions: iOS requires `NSCalendarsUsageDescription`, and since iOS 17
  splits calendar access into full vs. write-only tiers
  (`NSCalendarsFullAccessUsageDescription` /
  `NSCalendarsWriteOnlyAccessUsageDescription`) — which tier we request
  changes whether the connector can answer "what's on my calendar" queries at
  all, or only blind-write new events. Android requires runtime-requested
  `READ_CALENDAR`/`WRITE_CALENDAR` (a dangerous-permission pair).
- A device can have several calendars (personal, work, subscribed/read-only,
  holidays). Something has to decide which calendar a new event lands in —
  either a fixed default/primary calendar, or a one-time setup step asking
  the user to pick, mirroring the pattern the Sovereign Tasks connector epic
  (4.2) already uses for its own one-time instance/token setup.
- **Resolved by reading the actual implementation** (`src/connectors/manifest/schema.ts`,
  `src/connectors/runtime/execute.ts`, `src/connectors/permissions/grants.ts`):
  a Calendar connector is not a Tier 1 connector at all. Research 0001 and
  [connector-framework.md](../epics/mobile/connector-framework.md#overview) define
  three trust tiers, and Tier 3 — "first-party native OS integration... not
  opened to third parties" — names **direct Contacts/Calendar writes**
  explicitly as its motivating example. Tier 1's manifest schema *requires*
  an HTTP `origin` (`request.origin: z.string().url()`) and at least one
  network origin (`permissions.network.origins`, `.min(1)`); there is no way
  to express "call `expo-calendar` instead of `fetch`" in that shape. The
  runtime's `executeConnectorCall()` confirms this is expected, not an
  oversight: its switch has exactly one case (`case 1`), and task 2.4's own
  doc comment reserves the extension point for "Tier 3 (native module
  dispatch), even if unimplemented until epic 5/9 needs [it]" — Calendar
  would be the first connector to actually need it.
- The **permission state machine** (`not-asked`/`granted`/`denied`, one
  record per connector ID, no blanket toggle, in `grants.ts`) is already
  fully generic and needs no changes. What's Tier-1-specific is the *scope*
  it tracks: `grant()`, `needsRedecision()`, and the stored
  `ConnectorGrant.grantedOrigins` field are all hardwired to
  `permissions.network.origins`. A Tier 3 connector has no origins — its
  scope is an OS capability (e.g. "calendar read/write"). Generalizing
  `grantedOrigins` into a generic granted-scope concept, filled by origins
  for Tier 1 and by capability names for Tier 3, is the actual small piece of
  new work here — not a redesign of the grant/consent model itself.

## Options considered

**A. Calendar events only, both platforms; model reminders as calendar-event
alerts (an alarm offset on an event), not a separate Reminders surface.**
Uniform behavior across platforms since EventKit calendar events also
support alerts. Recommended.

**B. Calendar events plus iOS EventKit Reminders as a second tool surface.**
More complete on iOS, platform-asymmetric, adds manifest and UI surface for a
capability Android can't match.

**C. Defer "reminders" entirely to a future, unrelated
`expo-notifications`-based local-reminders feature; ship Calendar events
only.**

## Recommendation

Option A. Reminders-as-event-alerts is the one interpretation that works
identically on both platforms and ships as a single coherent connector
rather than an iOS-only bolt-on.

## Decisions

- **This is a Tier 3 connector**, not Tier 1 — first-party native OS
  integration, per research 0001 and connector-framework.md's own
  definitions. It is the first connector to actually need Tier 3, so it
  cannot ship until that reserved extension point (manifest schema variant,
  generalized grant scope, `case 3` runtime dispatch) is built — a small,
  shared prerequisite, not Calendar-specific work. [0009](0009-device-connector.md)
  and [0008](0008-health-step-count.md) need the exact same scaffolding.
- Tool scope: `calendar.create_event`, `calendar.update_event`,
  `calendar.delete_event`, `calendar.query_events`; reminders expressed as an
  alert on a created event, not a separate API surface.
- Recurrence, timezones, and all-day events are real edge-case surface;
  MVP should explicitly scope these down (e.g. single, non-recurring,
  timezone-naive events first) rather than solve them all at once.

## Open questions

- Which calendar (of possibly several) new events are written to — fixed
  default, or a one-time setup step per epic 4.2's pattern?
- `expo-calendar`'s compatibility with the installed Expo SDK 57 / RN 0.86
  toolchain — confirm before implementation, not assumed here.
- Exact shape of the generalized grant-scope concept (see Findings) — a
  design decision shared across all Tier 3 connectors, not this doc's to
  settle alone.

## Next steps

**Done:** the Tier 3 scaffolding prerequisite is now tracked as task
[2.6](../epics/mobile/connector-framework.md#-26--tier-3-connector-scaffolding),
and this connector has its own epic:
[calendar-connector.md](../epics/mobile/calendar-connector.md) (task 10.1), slotted
into [ROADMAP.md](../../ROADMAP.md) at 0.2.2 — after 2.6, ahead of the
Sovereign Tasks connector.

**Actual next step for whoever picks this up:** task 2.6 has to land first
(nothing here is implementable before it — there is no Tier 3 manifest shape
or runtime dispatch yet). Once 2.6 is done, task 10.1 can start; the open
questions above (which calendar, `expo-calendar` compatibility) are what's
left to settle during that implementation, not before it.
