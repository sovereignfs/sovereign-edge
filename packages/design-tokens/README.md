# `packages/design-tokens`

Empty scaffold — not populated yet. Will hold the token *data* currently
defined in `apps/mobile/src/design-system/theme.ts` and `semantic.ts`
(colors, spacing, typography) with the React Native component set
(`Button`, `ChatBubble`, `ListItem`, `TextField`, `Toggle`) left behind in
`apps/mobile/src/design-system/components/` — or moved to a future
`packages/mobile-ui` — since components are not portable to desktop the way
token data is.

Whether this split is worth making before `apps/desktop` exists depends on
epic 9.1's shell-tech decision: if desktop ends up on `react-native-macos`/
`react-native-windows`, mobile's existing component set may be reusable
directly and this package matters less than if desktop needs a separate
web-based component set (see `packages/desktop-ui`'s README).
