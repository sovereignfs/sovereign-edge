/**
 * Connector execution outcomes (task 2.4).
 *
 * Typed rather than thrown, matching the shape task 2.3 established for
 * `RoutingDecision` — whoever consumes this gets a switch, not a try/catch,
 * and every failure names a reason a fallback message can be honest about
 * rather than a generic "something went wrong."
 */
export type ExecutionResult =
  | { ok: true; text: string }
  | {
      ok: false;
      reason:
        /** `isAllowed()` failed. Re-checked here even though task 2.3's
         * routing layer already checked it — this function must not assume
         * its caller did. */
        | 'not-permitted'
        /** `isConnectorUsable()` failed: a paid connector with no recorded
         * entitlement (task 6.1). Checked before the grant check would ever
         * matter — an unentitled paid connector has nothing to dispatch to,
         * grant or no grant. */
        | 'not-entitled'
        /** The manifest needs a credential the vault has never stored. */
        | 'missing-credential'
        /** The model's arguments can't fill the manifest's request — most
         * concretely, a required path slot with no matching argument. A
         * path segment cannot be omitted the way a query value can. */
        | 'invalid-arguments'
        /** `fetch` itself failed: no connectivity, DNS, TLS, timeout. */
        | 'network-error'
        /** The endpoint tried to redirect. Never followed — see
         * research 0004's open question on redirects defeating an origin
         * allowlist. */
        | 'redirected'
        /** A non-2xx response. */
        | 'http-error'
        /** The response exceeded `response.maxBytes`. */
        | 'response-too-large'
        /** The body wasn't valid JSON, or `response.textFrom` didn't
         * resolve to anything. */
        | 'malformed-response'
        /** Tier 3 only: no native handler is registered for the manifest's
         * `handler.capability`, or the registered one threw. */
        | 'handler-error';
      detail?: string;
    };
