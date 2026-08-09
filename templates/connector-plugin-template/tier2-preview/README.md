# Tier 2 preview — not functional

This directory is a sketch, not a working example. Sovereign Edge has no
Tier 2 sandboxed script runtime yet — that's
[task 5.6](https://github.com/sovereignfs/sovereign-edge/blob/main/docs/epics/shared/connector-store-sdk.md)
in the Connector Store & SDK epic, and it's explicitly blocked on a real
Tier 2 use case existing before it gets built (the project avoids
building speculative infrastructure ahead of a real need).

Nothing here validates against `@sovereignfs/connector-sdk` — there is no
`connectorManifestTier2` schema to validate against, and
[`transform.example.js`](transform.example.js) is not loaded, sandboxed,
or executed by anything.

It exists only to show the shape a Tier 2 connector is expected to take
once the runtime lands: Tier 1's declarative request/response, plus a
transform step for response shaping a pure `textFrom` dotted-path
extraction can't express. If the actual Tier 2 design (task 5.6) settles
on something different, this preview will be wrong and should be updated
or removed rather than trusted as a spec.
