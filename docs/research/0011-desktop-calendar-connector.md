---
id: 11
title: "Desktop calendar connector: platform fit across macOS, Windows, Linux"
status: decided
date: "August 2026"
author: "Claude Code (session with the developer)"
scope: shared
summary: "Extending the Calendar connector (research 0005) to desktop — which OS calendar APIs are actually reachable from an unpackaged Tauri app"
---

# Research 0011 — Desktop calendar connector: platform fit across macOS, Windows, Linux

**Related:** [Calendar Connector](../epics/mobile/calendar-connector.md) (task
10.1, mobile), [research 0005](0005-calendar-connector.md) (the mobile
scoping this extends), [Desktop Core Port](../epics/desktop/core-port.md)

---

## Question

The user asked for the Calendar connector on both mobile and desktop.
Mobile's answer (`expo-calendar`, uniform on iOS/Android) has no desktop
equivalent — what does each desktop OS actually offer, and is any of it
reachable from this app's real distribution shape (an unpackaged Tauri
binary, NSIS/MSI on Windows, no MSIX)?

## Findings

- **macOS — real, fully reachable.** Apple's EventKit framework
  (`EKEventStore`) is directly callable via `objc2-event-kit`, part of the
  well-established `objc2` project. No package-identity requirement, no
  shell-out. `objc2` itself (`0.6.4`) and `objc2-foundation` were already
  transitive dependencies of this app via Tauri's own macOS backend,
  confirmed by reading `Cargo.lock` before adding anything — this is not a
  novel FFI surface for the dependency graph, only for this app's own code.
  This is the only OS this development environment can actually build and
  verify (a real debug binary build + launch-smoke check, task 10.2's own
  verification).
- **Windows — real API exists, but not reachable from this app's actual
  distribution shape.** `windows::ApplicationModel::Appointments::
  AppointmentStore` (the official `windows` crate, Microsoft's own WinRT
  Calendar API) requires **package identity** — confirmed via Microsoft's
  own documentation on `APPMODEL_ERROR_NO_PACKAGE`/`E_ILLEGAL_METHOD_CALL`.
  This app ships as an unpackaged NSIS/MSI installer (task 14's own
  distribution model, no MSIX), so calling this API today would fail at
  runtime. The two ways around it — packaging with a sparse/external-location
  package to gain identity without moving to full MSIX, or falling back to
  Outlook COM automation (works unpackaged, but only if Outlook happens to
  be installed, an assumption this app makes nowhere else) — are both real
  scope, not a small addition, and neither was picked for this pass.
- **Linux — no single API to target.** GNOME's calendar/contacts stack
  (`evolution-data-server`) exposes its own D-Bus interface
  (`org.gnome.evolution.dataserver.Calendar`); KDE's Akonadi is a
  structurally different protocol (its own D-Bus + local-socket IMAP-like
  layer, per Akonadi's own architecture docs), not a thin skin over EDS.
  Genuine support means picking one backend (most plausibly GNOME/EDS,
  since it's the more standardized of the two) and documenting KDE/other
  desktop environments as unsupported — a real per-desktop-environment
  support matrix, not a single implementation.
- **No Rust crate in this repo's dependency graph today bridges any of the
  above except the macOS one** — `keyring`'s existing
  `[target.'cfg(target_os = "...")'.dependencies]` blocks in `Cargo.toml`
  were the only precedent for platform-conditional native dependencies
  before this task, and only the macOS block gained new dependencies
  (`objc2`, `objc2-event-kit`, `objc2-foundation`, `block2`).

## Decision

**macOS now, via real EventKit bindings; Windows and Linux stay unsupported
for this pass, documented here rather than silently dropped.** Confirmed
with the user directly (not inferred) — the alternative of researching all
three before writing any code, chosen explicitly over shipping macOS alone
without the comparison, or attempting all three unverified.

`known_connector_manifests()` (`apps/desktop/src-tauri/src/lib.rs`) only
includes the four calendar manifests when `cfg!(target_os = "macos")` — via
`connectors::calendar::calendar_manifests()` itself returning an empty
`Vec` off macOS, not a call-site `cfg!` — so a Windows or Linux build never
advertises a connector it can't run; this needed no manifest schema change
(desktop's `platforms: ["desktop"]` value is already OS-agnostic by design,
matching mobile's `["ios","android"]` — see the Calendar SDK's own schema
comment) — it needed a Rust-side scoping decision instead.

## Open questions for whoever picks Windows/Linux up next

- **Windows:** does adopting a sparse/external-location package (identity
  without full MSIX) conflict with anything in the existing NSIS/MSI
  release pipeline (`.github/workflows/desktop-release.yml`)? Not
  evaluated here — this decision was scoped to "is EventKit reachable
  today," not "redesign desktop's packaging model."
- **Linux:** GNOME/EDS only, or attempt a KDE/Akonadi backend too? EDS-only
  is the pragmatic default (GNOME's stack is closer to a stable public API
  surface than Akonadi's), but this wasn't decided here, only flagged as
  the fork whoever picks this up will hit first.
