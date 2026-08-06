import {
  MANIFEST_VERSION,
  connectorManifest,
  type ConnectorManifest,
  type ValueSource,
} from './schema';

/**
 * Manifest validation (task 2.1).
 *
 * Two passes, because they answer different questions. Zod checks the
 * *shape*. This file checks the things that only make sense across fields —
 * a slot that names a parameter the tool does not declare, a credential in a
 * URL, an origin outside the connector's own allowlist. Those are the rules
 * that carry the security properties, and none of them is expressible as a
 * per-field type.
 *
 * Used at author time and again at load time. The same function both times:
 * a manifest that reaches a device has no more claim to being well-formed
 * than one being written, and in Phase 3 rather less.
 */

export type ValidationIssue = {
  /** Dotted location within the manifest, e.g. `request.query.q`. */
  path: string;
  message: string;
};

export type ValidationResult =
  | { valid: true; manifest: ConnectorManifest }
  | { valid: false; issues: ValidationIssue[] };

/** Origins must be exact: scheme, host, optional port. Nothing else. */
function originIssue(value: string, at: string): ValidationIssue | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { path: at, message: `Not a valid URL: ${value}` };
  }

  if (url.protocol !== 'https:') {
    return {
      path: at,
      message:
        `Origins must use https (got ${url.protocol}). iOS App Transport ` +
        'Security refuses cleartext, so an http origin cannot work on device.',
    };
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return {
      path: at,
      message:
        `An origin is scheme, host and optional port only — no path, query, ` +
        `or fragment. Move "${url.pathname}${url.search}${url.hash}" into ` +
        'request.path or request.query.',
    };
  }
  if (url.username !== '' || url.password !== '') {
    return {
      path: at,
      message:
        'An origin must not carry userinfo. Credentials belong in a header ' +
        'or a body field, never in a URL.',
    };
  }
  return null;
}

function sources(
  record: Record<string, ValueSource> | undefined,
  at: string,
): { source: ValueSource; path: string }[] {
  return Object.entries(record ?? {}).map(([key, source]) => ({
    source,
    path: `${at}.${key}`,
  }));
}

/**
 * Cross-field rules. Runs only once the shape is known good, so it can read
 * the manifest as typed rather than defensively.
 */
function crossFieldIssues(manifest: ConnectorManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { request, permissions, tool } = manifest;

  const declaredParams = new Set(Object.keys(tool.parameters.properties));
  const declaredCredentials = new Set(
    (permissions.credentials ?? []).map((c) => c.key),
  );

  const originError = originIssue(request.origin, 'request.origin');
  if (originError) issues.push(originError);

  for (const [i, origin] of permissions.network.origins.entries()) {
    const error = originIssue(origin, `permissions.network.origins[${i}]`);
    if (error) issues.push(error);
  }

  // The allowlist is what the runtime enforces; a request origin outside it
  // would be refused at execution, so refusing it here turns a runtime
  // failure into an authoring error.
  if (!permissions.network.origins.includes(request.origin)) {
    issues.push({
      path: 'request.origin',
      message:
        `${request.origin} is not in permissions.network.origins. Every ` +
        'origin a connector reaches must be declared, so the user sees it ' +
        'before granting access.',
    });
  }

  // Where each kind of value is allowed to appear. Credentials are absent
  // from the URL-bearing positions by construction rather than by check.
  const urlPositions = [
    ...request.path.flatMap((part, i) =>
      'slot' in part
        ? [{ source: part as ValueSource, path: `request.path[${i}]` }]
        : [],
    ),
    ...sources(request.query, 'request.query'),
  ];
  const bodyPositions = [
    ...sources(request.headers, 'request.headers'),
    ...sources(request.body, 'request.body'),
  ];

  for (const { source, path } of urlPositions) {
    if ('credential' in source) {
      issues.push({
        path,
        message:
          'A credential may not appear in a URL. URLs reach proxy logs, ' +
          'Referer headers, and crash reports. Put it in request.headers ' +
          'or request.body.',
      });
    }
  }

  for (const { source, path } of [...urlPositions, ...bodyPositions]) {
    if ('slot' in source && !declaredParams.has(source.slot)) {
      issues.push({
        path,
        message:
          `Slot "${source.slot}" is not declared in tool.parameters.` +
          `properties. The model can only fill slots it knows about.`,
      });
    }
    if ('credential' in source && !declaredCredentials.has(source.credential)) {
      issues.push({
        path,
        message:
          `Credential "${source.credential}" is not declared in ` +
          'permissions.credentials, so the user would never be asked for it.',
      });
    }
  }

  if (request.method === 'GET' && request.body !== undefined) {
    issues.push({
      path: 'request.body',
      message: 'A GET request cannot carry a body.',
    });
  }

  return issues;
}

/**
 * Validates a manifest from untrusted input.
 *
 * An unknown `manifestVersion` is rejected outright rather than parsed
 * leniently: a connector that refuses to load is a better outcome than one
 * that loads with a field silently ignored, because the ignored field is as
 * likely to be a permission as a label.
 */
export function validateManifest(input: unknown): ValidationResult {
  const version = (input as { manifestVersion?: unknown } | null)
    ?.manifestVersion;
  if (version !== undefined && version !== MANIFEST_VERSION) {
    return {
      valid: false,
      issues: [
        {
          path: 'manifestVersion',
          message:
            `Unsupported manifestVersion ${String(version)}. This build ` +
            `understands version ${MANIFEST_VERSION}. The manifest is not ` +
            'loaded rather than partially understood.',
        },
      ],
    };
  }

  const parsed = connectorManifest.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    };
  }

  const issues = crossFieldIssues(parsed.data);
  return issues.length > 0
    ? { valid: false, issues }
    : { valid: true, manifest: parsed.data };
}
