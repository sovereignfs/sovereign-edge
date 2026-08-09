# Example: Tier 1 REST connector with token auth

Calls GitHub's `GET /user` endpoint to return the username for whichever
personal access token the connector is configured with — a real,
recognizable API that requires auth, chosen so this example demonstrates
a genuine credential-bearing request rather than a contrived one.

The token is declared in `permissions.credentials` (key `authHeader`)
and injected into the `Authorization` request header via
`{ "credential": "authHeader" }` — never into the URL. That's not a
style choice: the schema's validator flatly rejects a credential placed
in `request.query` or `request.path`, because URLs end up in proxy logs,
`Referer` headers, and crash reports in a way headers over HTTPS don't.

**One real constraint worth knowing, not papered over:** the manifest
format has no string interpolation, so a header's value is exactly
whatever the user stored for that credential — there's no way for a
manifest to prepend `"Bearer "` to a raw token. The credential's label
says so explicitly ("full Authorization header value"): what a user
pastes into the credential prompt has to already be the complete header
value, e.g. `Bearer ghp_xxxxxxxxxxxx`. This is the same constraint the
first-party Search connector's own SearXNG token already lives with —
not something new introduced here.
