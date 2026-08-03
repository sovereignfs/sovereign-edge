import { allowNetworkForConnector } from '../../chat/session/offlineTripwire';
import type { ConnectorManifest, ValueSource } from '../manifest';
import { isAllowed, openVault } from '../permissions';
import type { ExecutionResult } from './types';

/**
 * Connector runtime host (task 2.4).
 *
 * Executes a validated tool call against a Tier 1 connector's manifest —
 * mapping the model's arguments into an HTTP request per `request`, and the
 * response back into text per `response`. No connector-specific code exists
 * here or anywhere else: the manifest alone is the whole of a Tier 1
 * connector, same as task 2.1 established for the schema itself.
 *
 * Not a manifest field per the epic's own list, so both are runtime
 * constants rather than connector-configurable. No retries: a single clean
 * failure is more honest than silently repeating a request the user never
 * saw happen once.
 */
const TIMEOUT_MS = 15_000;

type Resolved =
  | { kind: 'value'; value: unknown }
  /** The referenced argument was never supplied — a query value or header
   * can simply be left out; a path segment cannot. */
  | { kind: 'omit' }
  | { kind: 'error'; reason: 'missing-credential' };

function resolve(
  source: ValueSource,
  args: Record<string, unknown>,
  credentials: Map<string, string>,
): Resolved {
  if ('literal' in source) return { kind: 'value', value: source.literal };
  if ('slot' in source) {
    const value = args[source.slot];
    return value === undefined ? { kind: 'omit' } : { kind: 'value', value };
  }
  const secret = credentials.get(source.credential);
  return secret === undefined
    ? { kind: 'error', reason: 'missing-credential' }
    : { kind: 'value', value: secret };
}

/** Dotted path into a parsed JSON body, e.g. `results.0.snippet`. */
function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}

async function executeTier1(
  manifest: ConnectorManifest,
  args: unknown,
): Promise<ExecutionResult> {
  if (!isAllowed(manifest)) {
    return { ok: false, reason: 'not-permitted' };
  }

  const argRecord =
    typeof args === 'object' && args !== null
      ? (args as Record<string, unknown>)
      : {};

  const { request, response: responseSpec } = manifest;

  const credentialKeys = new Set<string>();
  for (const source of [
    ...Object.values(request.headers ?? {}),
    ...Object.values(request.body ?? {}),
  ]) {
    if ('credential' in source) credentialKeys.add(source.credential);
  }
  const vault = openVault(manifest.id);
  const credentials = new Map<string, string>();
  for (const key of credentialKeys) {
    const value = await vault.read(key);
    if (value === null) {
      return { ok: false, reason: 'missing-credential', detail: key };
    }
    credentials.set(key, value);
  }

  const segments: string[] = [];
  for (const part of request.path) {
    const resolved = resolve(part, argRecord, credentials);
    if (resolved.kind === 'error')
      return { ok: false, reason: resolved.reason };
    if (resolved.kind === 'omit') {
      return { ok: false, reason: 'invalid-arguments' };
    }
    segments.push(encodeURIComponent(String(resolved.value)));
  }

  const url = new URL(request.origin);
  url.pathname = '/' + segments.join('/');

  for (const [key, source] of Object.entries(request.query ?? {})) {
    const resolved = resolve(source, argRecord, credentials);
    if (resolved.kind === 'error')
      return { ok: false, reason: resolved.reason };
    if (resolved.kind === 'value') {
      url.searchParams.set(key, String(resolved.value));
    }
  }

  const headers: Record<string, string> = {};
  for (const [key, source] of Object.entries(request.headers ?? {})) {
    const resolved = resolve(source, argRecord, credentials);
    if (resolved.kind === 'error')
      return { ok: false, reason: resolved.reason };
    if (resolved.kind === 'value') headers[key] = String(resolved.value);
  }

  let body: string | undefined;
  if (request.body) {
    const bodyObj: Record<string, unknown> = {};
    for (const [key, source] of Object.entries(request.body)) {
      const resolved = resolve(source, argRecord, credentials);
      if (resolved.kind === 'error')
        return { ok: false, reason: resolved.reason };
      if (resolved.kind === 'value') bodyObj[key] = resolved.value;
    }
    body = JSON.stringify(bodyObj);
    // Mechanical, not something a connector author should have to declare.
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    // The one legitimate `fetch` call site in this codebase — see
    // `allowNetworkForConnector`'s own doc for why it has to name itself.
    res = await allowNetworkForConnector(() =>
      fetch(url.toString(), {
        method: request.method,
        headers,
        body,
        // Never followed. A redirect to another origin defeats the origin
        // allowlist that makes task 2.2's grant enforceable — see research
        // 0004's open question on this.
        redirect: 'manual',
        signal: controller.signal,
      }),
    );
  } catch (cause) {
    return {
      ok: false,
      reason: 'network-error',
      detail: cause instanceof Error ? cause.message : String(cause),
    };
  } finally {
    clearTimeout(timeout);
  }

  // `redirect: 'manual'` surfaces a redirect as an opaque response rather
  // than following it; checked by status too since not every environment's
  // fetch reports `type: 'opaqueredirect'` for a manual redirect.
  if (
    res.type === 'opaqueredirect' ||
    (res.status >= 300 && res.status < 400)
  ) {
    return { ok: false, reason: 'redirected' };
  }
  if (!res.ok) {
    return { ok: false, reason: 'http-error', detail: String(res.status) };
  }

  const declaredLength = Number(res.headers.get('content-length'));
  if (declaredLength > 0 && declaredLength > responseSpec.maxBytes) {
    return { ok: false, reason: 'response-too-large' };
  }

  const raw = await res.text();
  // Content-Length can be absent or wrong, so the decoded body is checked
  // regardless of what the header claimed.
  if (new TextEncoder().encode(raw).length > responseSpec.maxBytes) {
    return { ok: false, reason: 'response-too-large' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed-response' };
  }

  const text = readPath(parsed, responseSpec.textFrom);
  if (text === undefined) {
    return { ok: false, reason: 'malformed-response' };
  }

  return {
    ok: true,
    text: typeof text === 'string' ? text : JSON.stringify(text),
  };
}

/**
 * Executes a validated tool call against a connector's manifest.
 *
 * Dispatches on `manifest.tier`, though `tier` is typed as the literal `1`
 * until epic 5 (Tier 2, sandboxed scripts) or epic 9 (Tier 3, native module
 * dispatch) widen the manifest schema — there is nothing to route to yet, so
 * this is the reserved extension point the epic asks for, not a second
 * implementation in waiting.
 */
export async function executeConnectorCall(
  manifest: ConnectorManifest,
  args: unknown,
): Promise<ExecutionResult> {
  switch (manifest.tier) {
    case 1:
      return executeTier1(manifest, args);
  }
}
