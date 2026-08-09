# Sovereign Edge — Epics Overview

A domain-first map of all Sovereign Edge work streams, cross-cutting the
phase-sequenced [roadmap](../../ROADMAP.md). Each epic collects related tasks
regardless of when they're planned or shipped. Tasks within each epic carry a
stable ID (`<epic>.<seq>`) that can be cited in doc cross-references and
dependency lists (not commit messages or PR titles — see
[CONTRIBUTING.md](../../CONTRIBUTING.md#branching-and-commits)).

Full concept and architecture: [CONCEPT.md](../../CONCEPT.md). Decision
record behind this shape: [research 0001](../research/0001-concept-and-connector-architecture.md).

## Layout

Epics live in one of three directories, matching each file's own `scope:`
frontmatter — this is a structural split, not just a tag, so a file's
location always tells you where its code ships:

- **`mobile/`** — ships inside `apps/mobile` today.
- **`desktop/`** — ships inside `apps/desktop`, once it exists.
- **`shared/`** — platform-neutral by design, not owned by one app (the
  Connector SDK and Monetization epics: both are structured from the start
  to span mobile and desktop, not implemented in one first and ported later).

An epic's directory reflects what its deliverables target *today*, not final
architecture. A `mobile/` epic may move to `shared/` once its code is
extracted into `packages/core` (Connector Framework is the likely first
candidate) — moving the file is the update, not a separate tag to remember.
Epic IDs (`<epic>.<seq>`) are permanent regardless of which directory the
file lives in; only the path changes.

## Mobile

| ID  | Epic                                                                | Status         | Summary                                                                          |
| --- | ---------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| 0   | [Infrastructure](mobile/infrastructure.md)                            | ✅ Complete     | Repo scaffold, RN project setup, CI, build tooling for iOS/Android               |
| 1   | [Core Inference & Chat](mobile/core-inference-chat.md)                | ✅ Complete     | `llama.rn`/GGUF engine, model manager, fully offline chat and writing assistant   |
| 2   | [Connector Framework](mobile/connector-framework.md)                  | ⏳ In Progress  | Manifest schema, permission/consent model, tool-routing, tiered trust runtime — Tier 1 done, Tier 3 scaffolding (2.6) open |
| 3   | [Search Connector](mobile/search-connector.md)                        | ✅ Done         | Default Tier 1 connector — meta-search (SearXNG-aligned) web search              |
| 4   | [Sovereign Tasks Connector](mobile/sovereign-tasks-connector.md)      | 📋 Planned      | Default Tier 1 connector — direct API integration with a self-hosted `sovereign` |
| 7   | [Design System & Branding](mobile/design-system.md)                   | ⏳ In Progress  | Native theme adapting Sovereign's visual identity; standalone app, shared look   |
| 8   | [Mobile App Shell](mobile/mobile-app-shell.md)                        | ⏳ In Progress  | The React Native app itself — iOS + Android, not a WebView wrapper               |
| 10  | [Calendar Connector](mobile/calendar-connector.md)                    | 📋 Planned      | First Tier 3 connector — create/update/delete/query the device's own calendar   |
| 11  | [Device Connector](mobile/device-connector.md)                        | 📋 Planned      | Tier 3 connector — flashlight and app-window brightness                          |

## Desktop

| ID  | Epic                                       | Status      | Summary                                                                     |
| --- | -------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| 9   | [Desktop Shell](desktop/shell.md)           | ✅ Complete | Shell technology decision — Tauri v2, over Electron and a React Native shell |
| 12  | [Desktop Core Port](desktop/core-port.md)   | ✅ Done | Secondary, optional desktop client on Tauri — on-device inference, connector framework, grammar-constrained tool-calling, minimal offline chat UI, writing-assist modes (12.1–12.7, 12.7a, 12.8) |
| 13  | [Desktop App Shell](desktop/app-shell.md)   | ✅ Done | Real navigation, model manager, connectors/permissions, and settings screens — extracted from task 12.7's single chat screen |
| 14  | [Desktop Distribution & Signing](desktop/distribution.md) | ⏳ In Progress | Real signed/notarized installer artifacts and a self-update mechanism — no app store to piggyback on; 14.1/14.3/14.4 done — real macOS/Windows/Linux releases via CI, `v0.1.5` published, update mechanism live; only 14.2 (code signing) remains, skipped for now |

## Shared

| ID  | Epic                                                     | Status     | Summary                                                                 |
| --- | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| 5   | [Connector Store & SDK](shared/connector-store-sdk.md)      | ⏳ In Progress | Public SDK, plugin template, examples, registry, in-app connector store |
| 6   | [Monetization](shared/monetization.md)                      | 📋 Planned | Paid connectors — platform IAP (mobile), direct sale (desktop)          |

_Status key: ✅ Complete · ⏳ In Progress · 📋 Planned_
