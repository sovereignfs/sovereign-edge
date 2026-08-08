# `packages/desktop-ui`

React DOM component set for `apps/desktop`, matching `apps/mobile/src/
design-system`'s shape (task 12.6, mirroring task 7.2): `ThemeProvider`,
`Button`, `ChatBubble`, `ListItem`, `TextField`, `Toggle`, built against
`packages/design-tokens`. Consumed by `apps/desktop` via a `workspace:*`
dependency — no build step; `main: "index.ts"` is consumed as raw TS source
the same way every `packages/*` scaffold in this repo declared from the
start.

## Styling

CSS Modules + CSS custom properties, no styling library dependency (none
existed anywhere in this repo before this package). `ThemeProvider` resolves
a `design-tokens` `Theme` object in JS and sets every token as a `--sv-*`
custom property via inline `style` on its wrapper `<div>` — generated fresh
every render from the token object, not kept in sync with a parallel CSS
file by hand. Component `.module.css` files reference `var(--sv-color-
surface)` etc. and never duplicate a value.

Light/dark resolution mirrors mobile's own `ThemeProvider.tsx`:
`window.matchMedia('(prefers-color-scheme: dark)')` stands in for React
Native's `useColorScheme()`, with the same "system default is light on an
inconclusive read" tie-break for the initial render before the media-query
listener has fired once.

## Where this deliberately differs from mobile

`Toggle` is the one component that can't port mobile's actual approach, not
just its RN implementation. Mobile's `Toggle` wraps React Native's native
`Switch` and ships **deliberately untinted** — its own doc comment explains
that theming it made dark mode *worse* (Android alpha-blending, unreliable
`thumbColor`), so it defers entirely to the OS control. The web has no
equivalent "free, already-legible OS switch" to defer to — `<input
type="checkbox">` renders as a checkbox, not a switch, and isn't reliably
restylable as one consistently across engines — so this `Toggle` is a themed
`role="switch"` button built from scratch. A deliberate, necessary
difference, not an oversight of mobile's own lesson.

## Verification

`pnpm typecheck` / `pnpm lint` clean across the workspace. Real rendering
verified by running `apps/desktop`'s actual Vite dev server and viewing
every component (a real browser engine, real CSS custom properties, real
light/dark switching) — not just a passing typecheck; confirmed via the
rendered DOM text, the accessibility tree (e.g. `Toggle` reporting as
`switch "Notifications"`, not a generic button), and an empty console-error
log.

**Honest gap:** the review checklist asks for rendering parity across at
least two of Tauri's actual embedded WebViews — WebKit (macOS), WebView2
(Windows), WebKitGTK (Linux). This environment has no way to launch or
screenshot the real Tauri window (the same limitation task 12.5 hit trying
to verify its own Tauri-ACL layer interactively), and the sandboxed browser
used for the check above is a separate engine entirely, not one of those
three — so it verifies the *components and tokens work in a real browser*,
not *cross-engine parity specifically*. Windows/Linux — and even a literal
macOS WKWebView — remain unverified, the same category of gap flagged for
every desktop task so far that needed a second OS or a native window.
