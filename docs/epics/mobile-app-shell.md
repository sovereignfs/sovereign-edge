# Epic: Mobile App Shell

> The React Native app itself — iOS and Android, from Phase 1. Not a WebView
> wrapper around anything; this is the actual product.

## Status

📋 Planned

## Overview

Distinct from `sovereign-mobile` (a planned, unrelated Capacitor shell that
just loads a self-hosted `sovereign` instance in a WebView). Sovereign Edge
is a real native app with its own UI, its own on-device inference, and its
own connector framework — nothing here is a wrapper around a web app.

## Tasks

#### 📋 8.1 — App scaffold, navigation, and settings

**Goal:** The screens and navigation structure everything else plugs into.

**Deliverables:**

- Chat screen, model manager screen, connector/permission settings screen,
  general settings.
- Navigation structure shared across iOS and Android (RN navigation
  library).

**Dependencies:** Task 0.1 (repo scaffold), Design System epic (7.1–7.2).

**Review checklist:**

- All core screens (chat, model manager, connector settings) are reachable
  and functional on both platforms.

---

#### 📋 8.2 — Store release setup

**Goal:** Get the app ready for App Store and Play Store submission.

**Deliverables:**

- App Store Connect and Google Play Console listings.
- Privacy declarations accurately reflecting the app's actual network
  behavior (no telemetry, connector-scoped network access) — this is the
  app's core trust claim, so the store-facing privacy labels have to be
  exactly right, not just marketing copy.

**Dependencies:** Task 8.1, Core Inference & Chat epic, Connector Framework
epic.

**Review checklist:**

- The App Store "privacy nutrition label" / Play Data Safety form accurately
  lists every network destination the app can reach and under what
  condition (i.e., only per granted connector).

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)
