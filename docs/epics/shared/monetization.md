---
epic: 6
title: Monetization
status: "📋 Planned"
scope: shared
---

# Epic: Monetization

> Paid connectors — platform in-app purchase on mobile, direct sale on
> desktop. The core app and baseline connectors are free forever and are
> never gated by anything in this epic.

**Scope note:** spans both apps by design (mobile IAP, desktop direct sale),
not scoped to one — see the taxonomy note in
[docs/epics/README.md](../README.md#layout).

## Overview

Mirrors `sovereign`'s own entitlement-based plugin monetization (RFC 0003 in
that repo) at the concept level — a connector author declares pricing, an
entitlement unlocks it — but the purchase rail diverges by platform because
mobile app stores require their own in-app purchase system for unlocking
digital features inside a binary, which `sovereign`'s self-hosted web
platform never had to deal with.

## Tasks

#### 📋 6.1 — Entitlement model

**Goal:** A platform-agnostic notion of "this connector is unlocked for this
user," independent of which purchase rail granted it.

**Deliverables:**

- An entitlement record/token concept a paid connector checks before it's
  usable, decoupled from the purchase mechanism itself (mirrors `sovereign`'s
  signed-entitlement pattern, adapted for a mobile/desktop client instead of
  a server).

**Dependencies:** Connector Framework epic (2.1, `pricing` field).

**Review checklist:**

- A connector marked paid is unusable without a valid entitlement, on any
  platform.

---

#### 📋 6.2 — Mobile in-app purchase integration

**Goal:** Unlock paid connectors via Apple/Google's required IAP systems.

**Deliverables:**

- StoreKit (iOS) and Google Play Billing (Android) integration.
- Purchase → entitlement-grant flow feeding into the Task 6.1 model.

**Dependencies:** Task 6.1.

**Review checklist:**

- A real sandbox purchase on both platforms results in the corresponding
  connector becoming usable, and a refund/revocation removes access.

---

#### 📋 6.3 — Desktop direct-sale flow

**Goal:** Sell paid connectors directly on desktop, where there's no app-
store payment requirement.

**Deliverables:**

- A direct purchase flow (payment provider TBD) granting the same
  entitlement model as Task 6.1, without an IAP intermediary.

**Dependencies:** Task 6.1, Desktop App epic.

**Review checklist:**

- A desktop purchase and a mobile purchase of the same connector both result
  in the identical entitlement check passing.

## Related Docs

- [CONCEPT.md](../../../CONCEPT.md)
- [research 0001](../../research/0001-concept-and-connector-architecture.md)
- [Connector Store & SDK](connector-store-sdk.md)
