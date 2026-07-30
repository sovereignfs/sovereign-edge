# Epic: Design System & Branding

> A native RN theme adapting Sovereign's visual identity — the app is fully
> standalone, but may look and feel like part of the same family.

## Status

📋 Planned

## Overview

Per the developer's decision in research 0001: Sovereign Edge is a fully
independent app with no runtime dependency on `sovereign`, but may reuse
Sovereign's visual identity. `@sovereignfs/ui` itself (CSS Modules + web
React components) isn't usable in React Native directly — this epic is about
porting the *token values and visual language* (monochrome identity, the
`--sv-*` scale) into a native theme system, not importing the web package.

## Tasks

#### 📋 7.1 — Native theme tokens

**Goal:** Port Sovereign's token values (spacing, radius, font-size scale,
monochrome color identity) into an RN-native theme (e.g. a plain TS theme
object / RN StyleSheet constants), without importing `@sovereignfs/ui`
itself.

**Deliverables:**

- A theme module mirroring `sovereign`'s primitive/semantic two-tier token
  structure conceptually, values ported by hand rather than shared at the
  code level.
- Light/dark mode support, matching Sovereign's existing dark-mode override
  pattern.

**Dependencies:** none within this epic.

**Review checklist:**

- Switching light/dark mode restyles the whole app from the semantic theme
  layer, with no per-component hardcoded colors.

---

#### 📋 7.2 — Core component set

**Goal:** The minimum native component set the chat and settings UI need.

**Deliverables:**

- Button, input, chat bubble, list item, toggle, and similar primitives
  built on Task 7.1's theme, styled consistently with the wider Sovereign
  identity without being the same code.

**Dependencies:** Task 7.1.

**Review checklist:**

- No screen in the app hardcodes a color, spacing, or radius value outside
  the theme module.

## Related Docs

- [CONCEPT.md](../../CONCEPT.md)
- [research 0001](../research/0001-concept-and-connector-architecture.md)
