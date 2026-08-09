## Connector registry submission

<!--
For adding or updating an entry in registry/connectors.json.
For code/docs changes use the default template instead.
See registry/CONTRIBUTING.md for the full requirements.
-->

**Connector:** <!-- name --> (`<!-- id, e.g. com.example.your-connector -->`)
**Tier:** <!-- 1 -->
**Submission type:** <!-- new listing / update existing entry / removal -->

## Requirements checklist

- [ ] I ran **`pnpm registry:check`** locally and it passed
- [ ] My `manifest` is embedded **unmodified** — the exact JSON I validated with `@sovereignfs/connector-sdk`, not hand-edited afterward
- [ ] `id` is globally unique (reverse-DNS) and does not collide with an existing entry
- [ ] `entry.manifest.id` matches `entry.id`
- [ ] `submittedBy.name` (and ideally a `contact`) is filled in
- [ ] `pricing` accurately reflects whether this connector is actually free or paid
- [ ] `tool.description` and `tool.parameters` accurately and honestly describe what the connector does — no misleading or vague descriptions
- [ ] `permissions.network.origins` lists every origin the connector actually reaches — nothing broader, nothing missing

## Notes

<!-- Anything a reviewer should know. Delete if not applicable. -->
