/**
 * Task 1.5: a development-time runtime guard on the offline boundary.
 *
 * The static checks — ESLint rules and `scripts/ci/check-offline-boundary.js`
 * — are the real guarantee, and they run before anything ships. This catches
 * the residue they cannot see: a network call made through a dynamic path,
 * from inside a dependency `src/chat/` legitimately imports, or via a global
 * reached in a way the syntax rules do not name.
 *
 * **Development and test only, deliberately.** Failing closed in a Release
 * build would turn a boundary violation into a crash in the user's hands, on
 * a path never exercised in testing — punishing the user for the project's
 * mistake. A violation reaching Release means CI already failed, which is the
 * problem to fix. See "Resolved before implementation" in
 * docs/epics/core-inference-chat.md.
 *
 * Not installed automatically. `App.tsx` arms it, so the boundary is visible
 * at the app's entry point rather than as a side effect of an import.
 */

type NetworkGlobal = 'fetch' | 'XMLHttpRequest' | 'WebSocket' | 'EventSource';

const GUARDED: NetworkGlobal[] = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
];

function violation(name: NetworkGlobal): Error {
  return new Error(
    `Offline boundary violated: ${name}() was called.\n\n` +
      'The chat and model layers are offline by design (research 0001) — ' +
      'no network code path exists there at all. Network access belongs in ' +
      'src/connectors/, behind an explicit per-connector grant.\n\n' +
      'This guard runs in development only. It fired because the static ' +
      'checks did not catch this path, which is worth understanding before ' +
      'working around it. See docs/network-audit.md.',
  );
}

/**
 * How many `allowNetworkForConnector` calls are currently on the stack.
 *
 * Module-scoped rather than per-armed-instance: the guard functions created
 * below close over it, and it only ever needs to answer "is a permitted
 * caller mid-call right now," not track who.
 */
let bypassDepth = 0;

/**
 * The one door `src/connectors/` is allowed to use to reach the network
 * while the tripwire is armed (task 2.4).
 *
 * The violation message above has always said "network access belongs in
 * `src/connectors/`, behind an explicit per-connector grant" — but until a
 * connector runtime existed to call `fetch`, nothing had actually exercised
 * that claim. Blanket-replacing the global made every caller indistinguishable,
 * connector or otherwise, which is wrong-shaped now that one is legitimate.
 *
 * Deliberately a named, importable function rather than a blanket exemption:
 * grepping this file shows the entire boundary and its one exception in one
 * place, and a caller reaching the network without going through it is a
 * visible-in-review act, not an easy mistake — the same guarantee task 2.2
 * gives credential isolation.
 */
export function allowNetworkForConnector<T>(fn: () => T): T {
  bypassDepth++;
  try {
    return fn();
  } finally {
    bypassDepth--;
  }
}

/**
 * Replaces the ambient network globals with throwing stubs.
 *
 * Returns a function that restores them. No-op outside development, so
 * calling it unconditionally at startup is safe.
 */
export function armOfflineTripwire(): () => void {
  if (!__DEV__) return () => {};

  const scope = globalThis as unknown as Record<string, unknown>;
  const saved = new Map<NetworkGlobal, unknown>();

  for (const name of GUARDED) {
    // Metro's dev client needs its own socket back to the packager, and the
    // React DevTools bridge uses WebSocket. Guarding those would make the
    // tripwire fire on the tooling rather than on product code, so only the
    // request-shaped globals are replaced when a packager connection is live.
    if (name === 'WebSocket') continue;

    const original = scope[name];
    saved.set(name, original);
    scope[name] = function guarded(this: unknown, ...args: unknown[]) {
      if (bypassDepth > 0) {
        return (original as (...a: unknown[]) => unknown).apply(this, args);
      }
      throw violation(name);
    };
  }

  return () => {
    for (const [name, original] of saved) scope[name] = original;
  };
}
