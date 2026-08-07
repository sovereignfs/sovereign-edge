# `packages/mobile-ui`

Empty scaffold — not populated yet. The real component set
(`ThemeProvider`, `Button`, `ChatBubble`, `ListItem`, `TextField`, `Toggle`)
still lives in `apps/mobile/src/design-system/`, working as-is.

Epic 9.1 (desktop shell technology spike) resolved desktop onto Tauri v2, a
React DOM frontend — not `react-native-macos`/`-windows` — so desktop will
never be a consumer of this package; see
[research 0010](../../docs/research/0010-desktop-shell-technology.md) and
`packages/desktop-ui`'s own README, which gets that role instead. Nothing
else in this workspace is a second consumer either, so promoting
`apps/mobile/src/design-system/components/` here remains speculative and
still shouldn't happen ahead of an actual second use case — matches this
repo's own convention of not building shared infrastructure ahead of a real
second use case (e.g. Tier 2's sandboxed connector runtime, deferred for the
same reason per research 0001).
