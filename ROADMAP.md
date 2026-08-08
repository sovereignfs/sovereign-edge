# Sovereign Edge — Roadmap

**Version:** 0.2.1 · **Last updated:** 2026-08-08

Chronological task index. Full task detail lives in
[`docs/epics/`](docs/epics/). Decision record behind this phasing:
[research 0001](docs/research/0001-concept-and-connector-architecture.md).

Phased so the foundation is built once and widened without rework — see
CONCEPT.md's ["Phasing"](CONCEPT.md#phasing-build-a-foundation-that-evolves-without-friction)
section. Mobile (iOS + Android together) is the primary track from Phase 1;
Desktop is secondary and picked up only after Phase 1 ships.

---

## Mobile (iOS + Android)

### Phase 1 — MVP/POC: offline chat + built-in Search connector

Goal: prove the core trust proposition end to end — fully offline chat, plus
one explicit-permission connector reaching outside — on both platforms. No
connector store, no third-party anything, no monetization yet.

| Version | Task                                     | Status | Scope  | Epic task                                                                              |
| ------- | ------------------------------------------ | ------ | ------ | ----------------------------------------------------------------------------------------- |
| 0.1.1   | Repo scaffold                             | ✅     | Mobile | [0.1](docs/epics/mobile/infrastructure.md#-01--repo-scaffold)                                   |
| 0.1.2   | CI pipeline                               | ✅     | Mobile | [0.2](docs/epics/mobile/infrastructure.md#-02--ci-pipeline)                                      |
| 0.1.3   | Native build tooling                      | ✅     | Mobile | [0.3](docs/epics/mobile/infrastructure.md#-03--native-build-tooling)                            |
| 0.1.4   | Model asset pipeline                      | ✅     | Mobile | [0.4](docs/epics/mobile/infrastructure.md#-04--model-asset-pipeline)                            |
| 0.1.5   | `llama.rn` integration and inference wrapper | ✅ | Mobile | [1.1](docs/epics/mobile/core-inference-chat.md#-11--llamarn-integration-and-inference-engine-wrapper) |
| 0.1.6   | Model manager                             | ✅     | Mobile | [1.2](docs/epics/mobile/core-inference-chat.md#-12--model-manager)                              |
| 0.1.6a  | Native SHA-256 hashing                    | ✅     | Mobile | [0.5](docs/epics/mobile/infrastructure.md#-05--native-sha-256-hashing)                          |
| 0.1.7   | Native theme tokens                       | ✅     | Mobile | [7.1](docs/epics/mobile/design-system.md#-71--native-theme-tokens)                              |
| 0.1.8   | Core component set                        | ✅     | Mobile | [7.2](docs/epics/mobile/design-system.md#-72--core-component-set)                               |
| 0.1.9   | App scaffold, navigation, and settings    | ✅     | Mobile | [8.1](docs/epics/mobile/mobile-app-shell.md#-81--app-scaffold-navigation-and-settings)          |
| 0.1.10  | Offline chat UI                           | ✅     | Mobile | [1.3](docs/epics/mobile/core-inference-chat.md#-13--offline-chat-ui)                            |
| 0.1.11  | Writing-assist modes                      | ✅     | Mobile | [1.4](docs/epics/mobile/core-inference-chat.md#-14--writing-assist-modes)                       |
| 0.1.11a | Remember the chosen model                 | ✅     | Mobile | [1.6](docs/epics/mobile/core-inference-chat.md#-16--remember-the-chosen-model)                  |
| 0.1.12  | Zero-network enforcement and audit        | ✅     | Mobile | [1.5](docs/epics/mobile/core-inference-chat.md#-15--zero-network-enforcement-and-audit)         |
| 0.1.13  | Connector manifest schema (Tier 1)        | ✅     | Mobile | [2.1](docs/epics/mobile/connector-framework.md#-21--connector-manifest-schema-tier-1)           |
| 0.1.14  | Permission and consent model              | ✅     | Mobile | [2.2](docs/epics/mobile/connector-framework.md#-22--permission-and-consent-model)               |
| 0.1.15  | Tool-routing / intent-detection layer     | ✅     | Mobile | [2.3](docs/epics/mobile/connector-framework.md#-23--tool-routing--intent-detection-layer)       |
| 0.1.16  | Connector runtime host                    | ✅     | Mobile | [2.4](docs/epics/mobile/connector-framework.md#-24--connector-runtime-host)                     |
| 0.1.17  | In-chat connector provenance              | ✅     | Mobile | [2.5](docs/epics/mobile/connector-framework.md#-25--in-chat-connector-provenance)               |
| 0.1.18  | Default Search connector                  | ✅     | Mobile | [3.1](docs/epics/mobile/search-connector.md#-31--default-search-connector)                      |
| —       | Configurable meta-search endpoint         | ✅ merged into 3.1 | Mobile | [3.2](docs/epics/mobile/search-connector.md#-32--configurable-meta-search-endpoint)  |
| 0.1.19  | Explicit Search mode                      | ✅     | Mobile | [3.3](docs/epics/mobile/search-connector.md#-33--explicit-search-mode)                          |
| 0.1.20  | Store release setup                       | 📋     | Mobile | [8.2](docs/epics/mobile/mobile-app-shell.md#-82--store-release-setup)                           |

---

### Phase 2 — Fully agentic layer, default connectors

Goal: add the Sovereign Tasks connector (scenario 3), the first Tier 3
(on-device) connectors — Calendar and Device Utilities — and real
connector-management UI. Still first-party only.

| Version | Task                                | Status | Scope  | Epic task                                                                                              |
| ------- | ------------------------------------ | ------ | ------ | --------------------------------------------------------------------------------------------------------- |
| 0.2.1   | Tier 3 connector scaffolding          | ✅     | Mobile | [2.6](docs/epics/mobile/connector-framework.md#-26--tier-3-connector-scaffolding)                                |
| 0.2.2   | Calendar connector                   | 📋     | Mobile | [10.1](docs/epics/mobile/calendar-connector.md#-101--calendar-connector)                                        |
| 0.2.3   | Device Utilities connector           | 📋     | Mobile | [11.1](docs/epics/mobile/device-connector.md#-111--device-utilities-connector)                                  |
| 0.2.4   | Sovereign Tasks connector            | 📋     | Mobile | [4.1](docs/epics/mobile/sovereign-tasks-connector.md#-41--sovereign-tasks-connector)                            |
| 0.2.5   | Instance URL and API token setup flow | 📋   | Mobile | [4.2](docs/epics/mobile/sovereign-tasks-connector.md#-42--instance-url-and-api-token-setup-flow)                |

---

### Phase 3 — Open connector ecosystem

Goal: open the connector layer to third-party developers, add the in-app
store, and turn on monetization.

| Version | Task                                       | Status | Scope  | Epic task                                                                                     |
| ------- | --------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------ |
| 0.3.1   | Connector SDK                                | 📋     | Shared | [5.1](docs/epics/shared/connector-store-sdk.md#-51--connector-sdk)                                     |
| 0.3.2   | Connector plugin template                    | 📋     | Shared | [5.2](docs/epics/shared/connector-store-sdk.md#-52--connector-plugin-template)                        |
| 0.3.3   | First-party example connectors               | 📋     | Shared | [5.3](docs/epics/shared/connector-store-sdk.md#-53--first-party-example-connectors)                    |
| 0.3.4   | Public connector registry and submission process | 📋 | Shared | [5.4](docs/epics/shared/connector-store-sdk.md#-54--public-connector-registry-and-submission-process) |
| 0.3.5   | In-app Connector Store                       | 📋     | Shared | [5.5](docs/epics/shared/connector-store-sdk.md#-55--in-app-connector-store)                            |
| 0.3.6   | Tier 2 sandboxed script runtime              | 📋     | Shared | [5.6](docs/epics/shared/connector-store-sdk.md#-56--tier-2-sandboxed-script-runtime)                   |
| 0.3.7   | Entitlement model                            | 📋     | Shared | [6.1](docs/epics/shared/monetization.md#-61--entitlement-model)                                        |
| 0.3.8   | Mobile in-app purchase integration           | 📋     | Shared | [6.2](docs/epics/shared/monetization.md#-62--mobile-in-app-purchase-integration)                       |

---

## Desktop

Secondary, optional. Still sequenced after mobile — epic 12 (Desktop Core
Port) has not started, and picking it up next vs. finishing mobile's own
remaining Phase 1 item (0.1.20) first is an open scheduling call, not
decided here. Shell technology **is** now decided — task 9.1 was
deliberately pulled forward as a scoping/planning pass, on the developer's
explicit instruction, ahead of 0.1.20 closing out Phase 1: see
[research 0010](docs/research/0010-desktop-shell-technology.md) (Tauri v2,
over Electron and a React Native desktop shell). Epic 9 (Desktop Shell) held
only that decision and is now closed; epic 12 (Desktop Core Port) holds the
rest of the desktop work, broken into 7 tasks (12.1–12.7) sized to match
mobile's own epic granularity — see [core-port.md](docs/epics/desktop/core-port.md).

### Non-prioritised tasks

Desktop app code — no version slot assigned yet; `apps/desktop/package.json`
stays at `0.0.0` until epic 12 ships something, per this repo's own
per-app versioning convention.

| Version | Task                                                | Status | Scope   | Epic task                                                                             |
| ------- | ------------------------------------------------------ | ------ | ------- | ------------------------------------------------------------------------------------------ |
| —       | Desktop shell technology spike                        | ✅     | Desktop | [9.1](docs/epics/desktop/shell.md#-91--desktop-shell-technology-spike)                     |
| —       | Tauri app scaffold and build tooling                  | ✅     | Desktop | [12.1](docs/epics/desktop/core-port.md#-121--tauri-app-scaffold-and-build-tooling)                   |
| —       | Rust `llama.cpp` `EngineAdapter` and model manager    | ✅     | Desktop | [12.2](docs/epics/desktop/core-port.md#-122--rust-llamacpp-engineadapter-and-model-manager)          |
| —       | `SecureStorageAdapter` over the OS credential store   | ✅     | Desktop | [12.3](docs/epics/desktop/core-port.md#-123--securestorageadapter-over-the-os-credential-store)      |
| —       | Connector framework port (Tier 1)                     | ✅     | Desktop | [12.4](docs/epics/desktop/core-port.md#-124--connector-framework-port-tier-1)                        |
| —       | Tier 3 native handler registry (Tauri)                | ✅     | Desktop | [12.5](docs/epics/desktop/core-port.md#-125--tier-3-native-handler-registry-tauri)                   |
| —       | `packages/desktop-ui` initial component set           | ✅     | Desktop | [12.6](docs/epics/desktop/core-port.md#-126--packagesdesktop-ui-initial-component-set)               |
| —       | Minimal offline chat UI                               | 📋     | Desktop | [12.7](docs/epics/desktop/core-port.md#-127--minimal-offline-chat-ui)                                |
| —       | Desktop direct-sale flow                              | 📋     | Shared  | [6.3](docs/epics/shared/monetization.md#-63--desktop-direct-sale-flow)                          |
