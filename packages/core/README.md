# `packages/core`

Empty scaffold — not populated yet. This package will hold the code that is
genuinely platform-agnostic and shared between `apps/mobile` and
`apps/desktop`:

- Permission/consent state machine (currently
  `apps/mobile/src/connectors/permissions/`)
- Tool-routing decision logic (currently
  `apps/mobile/src/connectors/routing/`)
- Platform-adapter interfaces (`EngineAdapter`, `SecureStorageAdapter`,
  `NativeHandlerRegistry`) that each app implements concretely

The connector manifest schema and validator were extracted separately, as
their own reviewed step (task 5.1) — they now live in
`packages/connector-sdk`, a distinct, independently-versioned package
because it's meant to be published for third-party connector authors, who
have no business depending on this package's other (internal-only)
concerns. `apps/mobile` consumes it via a workspace dependency.

**The remaining three items above have not been extracted yet.** The move requires
rewriting imports across `apps/mobile/src/connectors/`, `src/settings/`, and
their tests, and should happen as its own reviewed step — not bundled into
the workspace restructure that created this scaffold. See the connector
manifest schema's existing `platforms` field
(`docs/epics/mobile/connector-framework.md`, task 2.1) for why the Tier 1 shape is
already close to portable.

**Hard constraint carried over from `apps/mobile`:** whatever lands under a
future `core/chat/` here inherits the offline guarantee — no import that
opens a socket, enforced today by `apps/mobile/eslint.config.js` and
`apps/mobile/scripts/ci/check-offline-boundary.js`. Extracting `chat/` logic
here means extracting (not loosening) that enforcement too.
