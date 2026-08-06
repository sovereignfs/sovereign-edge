# AGENTS.md — apps/desktop

Stub. There is no code here yet — this app is blocked on epic 9.1 (desktop
shell technology spike, [docs/epics/desktop/desktop-app.md](../../docs/epics/desktop/desktop-app.md)).
Workspace-wide rules live in the [root AGENTS.md](../../AGENTS.md).

## Before writing any code here

1. Epic 9.1 must be resolved first — see the root `AGENTS.md`'s "Research
   precedes implementation" rule. A shell-technology decision (Tauri vs.
   Electron vs. a React Native desktop renderer) belongs in a research doc
   under `docs/research/`, not decided inline while implementing.
2. That decision determines whether `packages/mobile-ui` is reusable here
   directly or whether `packages/desktop-ui` needs real content — see both
   packages' own `README.md`.
3. Once real code lands, this file should grow the same sections
   `apps/mobile/AGENTS.md` has: State of play, environment quirks, Native
   project rules (or whatever this shell's equivalent is), Verification,
   Layout, Commands, Tech stack. Don't invent them speculatively now.

## What carries over unconditionally

The root `AGENTS.md`'s Hard architectural rules apply here the moment this
app has its own chat/model/connector code — they are not mobile-specific,
mobile is just their first implementation. In particular: no network code in
the chat path, no model weights shipped in the binary, and network access
only through a connector with an explicit per-connector permission grant.
