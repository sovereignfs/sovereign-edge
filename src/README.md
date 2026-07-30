# `src/` — module layout

One directory per epic, so code structure and planning structure stay aligned
(epic [0.1](../docs/epics/infrastructure.md) deliverable 3). When a task in
`docs/epics/` lands, its code belongs in the matching module here.

| Module           | Epic                                                            | Owns                                                                        |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `chat/`          | [1 — Core Inference & Chat](../docs/epics/core-inference-chat.md) | `llama.rn` wrapper, model manager, chat UI, writing-assist modes             |
| `connectors/`    | [2 — Connector Framework](../docs/epics/connector-framework.md)  | Manifest schema, permission/consent, tool routing, runtime host, provenance  |
| `design-system/` | [7 — Design System & Branding](../docs/epics/design-system.md)   | Theme tokens, core component set                                            |
| `settings/`      | [8 — Mobile App Shell](../docs/epics/mobile-app-shell.md)        | Navigation, settings screens, app shell                                     |
| `shared/`        | —                                                                | Cross-module utilities with no epic of their own                            |

Individual connectors (Search, Sovereign Tasks — epics 3 and 4) live under
`connectors/`, separate from the framework that hosts them.

## The one structural rule

`chat/` must not import anything that opens a socket. Per
[research 0001](../docs/research/0001-concept-and-connector-architecture.md#decisions),
the chat/model/memory layers are 100% offline by design — "no network code
path exists there at all." Every outbound call goes through `connectors/`,
behind an explicit per-connector permission grant. Task
[1.5](../docs/epics/core-inference-chat.md) turns this into an enforced,
audited boundary rather than a convention.

Imports resolve through the `@/` alias — `@/chat/...`, `@/connectors/...`.
