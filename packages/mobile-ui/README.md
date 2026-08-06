# `packages/mobile-ui`

Empty scaffold — not populated yet. The real component set
(`ThemeProvider`, `Button`, `ChatBubble`, `ListItem`, `TextField`, `Toggle`)
still lives in `apps/mobile/src/design-system/`, working as-is. This package
only becomes worth populating once there is a second real consumer of these
components (e.g. desktop lands on `react-native-macos`/`-windows`) — see
`packages/desktop-ui`'s README for why that's still an open question.

Promoting `apps/mobile/src/design-system/components/` here before that
second consumer exists would be speculative — matches this repo's own
convention of not building shared infrastructure ahead of a real second use
case (e.g. Tier 2's sandboxed connector runtime, deferred for the same
reason per research 0001).
