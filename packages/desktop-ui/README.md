# `packages/desktop-ui`

Empty scaffold — not populated yet, and may turn out unnecessary.

Whether this package is needed at all is decided by epic 9.1 (desktop shell
technology spike, see `docs/epics/desktop/desktop-app.md`):

- If desktop uses `react-native-macos`/`react-native-windows`, it can likely
  consume `packages/mobile-ui` directly (same RN primitives) and this
  package never needs real content.
- If desktop uses Tauri or Electron with a web frontend (React DOM or
  similar), it needs its own component set built against
  `packages/design-tokens`, and this is where that lives.

Do not populate this ahead of the 9.1 decision — it may be dead weight.
