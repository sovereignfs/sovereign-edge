# `packages/desktop-ui`

Empty scaffold — not populated yet, but epic 9 (Desktop Shell, see
`docs/epics/desktop/shell.md`) has resolved this package's fate: **needed**.
Desktop is Tauri v2 (a React DOM frontend), not
`react-native-macos`/`-windows` — see
[research 0010](../../docs/research/0010-desktop-shell-technology.md) — so
this package is not dead weight. It needs its own component set matching
`apps/mobile/src/design-system`'s (`ThemeProvider`, `Button`, `ChatBubble`,
`ListItem`, `TextField`, `Toggle`), built against `packages/design-tokens`
for React DOM rather than React Native primitives.

Still not populated ahead of epic 12 (Desktop Core Port — see
`docs/epics/desktop/core-port.md`) reaching task 12.6, its own initial
component-set task — that's what gives this package real consumers to build
against, not this doc.
