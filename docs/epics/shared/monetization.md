---
epic: 6
title: Monetization
status: "⏳ In Progress — 6.1 done; 6.2, 6.3 blocked on real Apple/Google/payment-provider accounts this environment doesn't have"
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

#### ✅ 6.1 — Entitlement model

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

**Decided:**

- **A plain local record, not a signed token**, asked of the user explicitly
  since research 0001 points at `sovereign`'s own signed-entitlement model
  (RFC 0003 in that repo, not available in this repo) as the concept to
  mirror. There is no real issuer to sign against yet — tasks 6.2 (mobile
  IAP) and 6.3 (desktop direct sale), the only things that would ever
  produce a real purchase receipt, are both blocked on real Apple/Google/
  payment-provider accounts this environment doesn't have. Building real
  signature verification now would mean the app both signing and verifying
  its own token, which proves nothing a plain record doesn't.
  `{connectorId, grantedAt, source}` — `source` is an opaque string a real
  caller will pass (`"ios-iap"`/`"android-iap"`/`"desktop-direct"` once
  6.2/6.3 land); nothing here inspects it, so a real signed receipt can be
  recorded later without changing this shape or any call site.
- **Same plain-JSON persisted-file pattern as `grants.ts`/`grants.rs`**:
  mobile's `connectors/permissions/entitlements.ts` (`entitlements.json`
  under `Paths.document/connectors/`) and desktop's
  `connectors/permissions/entitlements.rs` (`entitlements.json` under
  `state.connectors_dir`, taking the directory as an explicit parameter the
  same way `installed.rs` does). Lives beside `grants`/`grants.rs` rather
  than beside `store`/`installed.rs`: grants and entitlements both answer
  "may this connector run" (consent, then payment); `installed` answers
  "which manifests does this device have."
- **The gate applies at two points, both platforms**: the install screen/
  command (defense in depth — the store screen already disables the
  install button for a paid entry, but `ConnectorInstallScreen.tsx`'s
  `install()` and `install_connector`'s Tauri command both re-check
  `isConnectorUsable`/`is_connector_usable` rather than trusting the UI
  gate), and `executeConnectorCall`/`execute_connector_call` themselves,
  once at the shared entry point rather than duplicated per tier — a new
  `'not-entitled'`/`FailureReason::NotEntitled` failure reason, mirroring
  exactly how `'not-permitted'`/`FailureReason::NotPermitted` is already
  handled by `connectorOrchestration.ts`/`orchestration.rs`'s user-facing
  message mapping.

**Honest gap:**

- **Nothing in this app can grant a real entitlement yet.** `grantEntitlement`/
  `grant_entitlement` exist and are fully wired into every gate, but no UI
  calls them — that's exactly what 6.2 (mobile IAP) and 6.3 (desktop direct
  sale) will do once they exist. Until then, a paid connector in the store
  is permanently locked with no path to unlock it from inside the app; this
  is the correct, honest state (no real purchase rail should silently
  pretend to have one), not a bug to work around.

**Verified:**

- Mobile: `pnpm --filter mobile typecheck`/`lint`/`test` (268 tests, up from
  258 — `entitlements.test.ts` plus a new `execute.test.ts` case). Desktop:
  `cargo fmt`/`clippy`/`test` (137 tests, up from 128) and `pnpm --filter
  desktop typecheck`/`lint`/`test` (49 tests, unchanged) all clean.
  `pnpm check:offline` unaffected on both apps.
- **Real end-to-end proof, not just `entitlements.rs`'s own unit tests in
  isolation**: a new `execute.rs` integration test
  (`refuses_an_unentitled_paid_connector_even_when_granted`) grants a real
  on-disk *grant* for a paid manifest, confirms `execute_connector_call`
  still refuses it with `NotEntitled`, then calls the real
  `grant_entitlement` (the same function a future IAP success handler
  would call) against real on-disk state and confirms the gate passes
  (fails downstream on the network call instead, since the fixture's
  origin isn't a real server — proving the *gate*, not the whole request,
  changed), then `revoke_entitlement` and confirms it locks again. Mobile's
  `execute.test.ts` proves the same gate placement via its existing
  mock-based convention (`isConnectorUsable` mocked the same way
  `isAllowed` already is in that file).
- Real desktop debug binary build (`pnpm tauri build --debug --no-bundle`)
  and launch-smoke check: process starts, stays running, no panic.

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
