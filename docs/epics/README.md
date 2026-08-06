# Sovereign Edge — Epics Overview

A domain-first map of all Sovereign Edge work streams, cross-cutting the
phase-sequenced [roadmap](../../ROADMAP.md). Each epic collects related tasks
regardless of when they're planned or shipped. Tasks within each epic carry a
stable ID (`<epic>.<seq>`) that can be cited in PRs and commits.

Full concept and architecture: [CONCEPT.md](../../CONCEPT.md). Decision
record behind this shape: [research 0001](../research/0001-concept-and-connector-architecture.md).

## Epics

| ID  | Epic                                                    | Status     | Summary                                                                          |
| --- | -------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| 0   | [Infrastructure](infrastructure.md)                     | ✅ Complete | Repo scaffold, RN project setup, CI, build tooling for iOS/Android               |
| 1   | [Core Inference & Chat](core-inference-chat.md)         | ✅ Complete | `llama.rn`/GGUF engine, model manager, fully offline chat and writing assistant   |
| 2   | [Connector Framework](connector-framework.md)           | ⏳ In Progress | Manifest schema, permission/consent model, tool-routing, tiered trust runtime — Tier 1 done, Tier 3 scaffolding (2.6) open |
| 3   | [Search Connector](search-connector.md)                 | ✅ Done    | Default Tier 1 connector — meta-search (SearXNG-aligned) web search              |
| 4   | [Sovereign Tasks Connector](sovereign-tasks-connector.md) | 📋 Planned | Default Tier 1 connector — direct API integration with a self-hosted `sovereign` |
| 5   | [Connector Store & SDK](connector-store-sdk.md)         | 📋 Planned | Public SDK, plugin template, examples, registry, in-app connector store          |
| 6   | [Monetization](monetization.md)                         | 📋 Planned | Paid connectors — platform IAP (mobile), direct sale (desktop)                   |
| 7   | [Design System & Branding](design-system.md)            | ⏳ In Progress | Native theme adapting Sovereign's visual identity; standalone app, shared look   |
| 8   | [Mobile App Shell](mobile-app-shell.md)                 | ⏳ In Progress | The React Native app itself — iOS + Android, not a WebView wrapper               |
| 9   | [Desktop App](desktop-app.md)                           | 📋 Planned | Secondary, optional desktop client — shell technology not yet decided            |
| 10  | [Calendar Connector](calendar-connector.md)             | 📋 Planned | First Tier 3 connector — create/update/delete/query the device's own calendar   |
| 11  | [Device Connector](device-connector.md)                 | 📋 Planned | Tier 3 connector — flashlight and app-window brightness                          |

_Status key: ✅ Complete · ⏳ In Progress · 📋 Planned_
