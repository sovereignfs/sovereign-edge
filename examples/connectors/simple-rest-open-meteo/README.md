# Example: simple Tier 1 REST connector (no credentials)

Looks up the current temperature at a latitude/longitude from
[Open-Meteo](https://open-meteo.com/), a real, free weather API that
needs no API key — chosen deliberately so this example has nothing to
configure and can be read start to finish without a "go get an API key
first" detour.

The model supplies `latitude`/`longitude` as tool arguments; the manifest
maps them straight into query parameters via `slot` references — no
literal string-building, no interpolation, per the schema's own design
(see `packages/connector-sdk/src/schema.ts`'s module doc).

`permissions.network.origins` and `request.origin` both name the same
one origin (`https://api.open-meteo.com`) — that's what makes the
connector's declared network access match exactly what it actually
calls, the property `validateManifest`'s cross-field checks enforce.

The response's `current.temperature_2m` field becomes the tool result
text via `response.textFrom`.
