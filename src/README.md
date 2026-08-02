# `src/` — module layout

One directory per epic, so code structure and planning structure stay aligned
(epic [0.1](../docs/epics/infrastructure.md) deliverable 3). When a task in
`docs/epics/` lands, its code belongs in the matching module here.

| Module           | Epic                                                            | Owns                                                                        |
| ---------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `chat/`          | [1 — Core Inference & Chat](../docs/epics/core-inference-chat.md) | `llama.rn` wrapper, chat UI, writing-assist modes                            |
| `models/`        | [0.4 — Model asset pipeline](../docs/epics/infrastructure.md)     | Download, resume, checksum verification, on-device storage                   |
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
behind an explicit per-connector permission grant.

**This is enforced, not a convention** (task 1.5). ESLint restricts imports
and the ambient network globals inside `chat/`, and `pnpm check:offline` walks
the import graph to catch a transitive route lint cannot see.
[docs/network-audit.md](../docs/network-audit.md) records what each mechanism
covers and what it misses.

`models/` is why this is a separate module rather than living under `chat/`.
Downloading weights is unambiguously network activity, so putting it beside
the inference code would violate the rule above on day one. The split follows
the actual trust boundary: **acquiring** a model is a deliberate, visible,
user-initiated network action; **using** one is not, and never touches the
network.

**`chat/` does not import `models/` at all** — the checks reject it, including
transitively. The dependency is inverted instead: `chat/session/
ChatSessionContext` declares the narrow contract chat needs (status, model
name, `generate`), and the app shell implements it in
`settings/ModelSessionProvider`, which is the only place holding both the
engine and the manager. If chat appears to need something `models/` owns, add
it to that contract rather than reaching across.

Imports resolve through the `@/` alias — `@/chat/...`, `@/connectors/...`.
