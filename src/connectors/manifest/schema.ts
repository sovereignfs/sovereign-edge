import { z } from 'zod';

/**
 * The Tier 1 connector manifest (task 2.1).
 *
 * Every connector — the first-party Search connector now, third-party ones in
 * Phase 3 — is described entirely by this shape. No connector-specific code
 * exists in the runtime; a manifest is the whole of a Tier 1 connector.
 *
 * The design decisions and the reasoning behind them are in
 * [research 0004](../../../docs/research/0004-connector-manifest-schema.md).
 * Two are load-bearing and worth stating here, because they look like
 * over-engineering until you know what they prevent:
 *
 * 1. **There is no expression language and no string interpolation.** A
 *    request is assembled from literal parts and named slots, and the runtime
 *    encodes each slot for the position it occupies. The values filling those
 *    slots come from a language model, which is steered by whatever the user
 *    pasted into chat — untrusted input by any reasonable reading. Free
 *    interpolation would make origin escape, path traversal, and header
 *    injection expressible in a manifest, and a format that permits them
 *    cannot forbid them later without breaking every connector already
 *    written against it.
 *
 * 2. **A credential may never appear in a URL.** Not in the origin, not in a
 *    path segment, not in a query value. URLs end up in proxy logs, `Referer`
 *    headers, and crash reports. The validator rejects such a manifest rather
 *    than trusting an author to know this.
 */

/** Bumped when this schema changes shape. Distinct from a connector's own version. */
export const MANIFEST_VERSION = 1;

const SLOT_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const CONNECTOR_ID = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Where a single value comes from.
 *
 * Encoding is decided by *position*, not declared here: a `valueSource` inside
 * `query` is encoded as a query value, one inside `path` as a path segment.
 * Letting an author state the encoding separately from the position would
 * make the two capable of disagreeing, which is the bug this avoids.
 */
export const valueSource = z.union([
  z.object({ literal: z.string() }).strict(),
  z.object({ slot: z.string().regex(SLOT_NAME) }).strict(),
  z.object({ credential: z.string().min(1) }).strict(),
]);

export type ValueSource = z.infer<typeof valueSource>;

/** A path is literal segments and slots. A slot fills exactly one segment. */
export const pathPart = z.union([
  z
    .object({
      // No slashes: a literal segment cannot smuggle in extra path structure.
      literal: z
        .string()
        .regex(/^[^/?#]*$/, 'A path segment cannot contain /, ? or #'),
    })
    .strict(),
  z.object({ slot: z.string().regex(SLOT_NAME) }).strict(),
]);

/**
 * The tool as the model sees it. `parameters` is JSON Schema, kept opaque.
 *
 * JSON Schema specifically, because `llama.rn` converts it to a decoding
 * grammar (`json_schema` on `completion`), so task 2.3 gets constrained
 * output for free. It is validated shallowly — enough to know it is an object
 * schema with named properties, which is what slot references are checked
 * against — and otherwise passed through untouched.
 */
export const toolDefinition = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    description: z.string().min(1),
    parameters: z
      .object({
        type: z.literal('object'),
        properties: z.record(z.string(), z.unknown()),
        required: z.array(z.string()).optional(),
      })
      .loose(),
  })
  .strict();

export const permissions = z
  .object({
    network: z
      .object({
        /**
         * Origins this connector may reach. The runtime refuses anything
         * else, which is what makes epic 2.2's per-connector grant
         * enforceable rather than advisory.
         */
        origins: z.array(z.string().url()).min(1),
      })
      .strict(),
    credentials: z
      .array(
        z
          .object({
            key: z.string().regex(SLOT_NAME),
            /** Shown to the user when asking for it. */
            label: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const requestTemplate = z
  .object({
    method: z.enum(['GET', 'POST']),
    origin: z.string().url(),
    path: z.array(pathPart),
    query: z.record(z.string(), valueSource).optional(),
    headers: z.record(z.string(), valueSource).optional(),
    /** JSON body. Values may be slots or credentials; keys are literal. */
    body: z.record(z.string(), valueSource).optional(),
  })
  .strict();

/**
 * How a response becomes text for the model.
 *
 * Deliberately minimal. Mapping a response back into model context is the
 * mirror of the request problem — including how much of a body may reach the
 * context at all — and research 0004 leaves it to its own pass rather than
 * half-deciding it here.
 */
export const responseTemplate = z
  .object({
    /** Dotted path into the JSON body, e.g. `results.0.snippet`. */
    textFrom: z.string().min(1),
    /** Refuse a body larger than this before parsing it. */
    maxBytes: z.number().int().positive().max(1_000_000),
  })
  .strict();

export const connectorManifest = z
  .object({
    manifestVersion: z.literal(MANIFEST_VERSION),
    id: z.string().regex(CONNECTOR_ID),
    name: z.string().min(1),
    version: z.string().regex(SEMVER),
    summary: z.string().min(1),
    tier: z.literal(1),
    platforms: z.array(z.enum(['ios', 'android'])).min(1),
    tool: toolDefinition,
    permissions,
    request: requestTemplate,
    response: responseTemplate,
    pricing: z.union([
      z.object({ model: z.literal('free') }).strict(),
      z
        .object({ model: z.literal('paid'), productId: z.string().min(1) })
        .strict(),
    ]),
  })
  .strict();

export type ConnectorManifest = z.infer<typeof connectorManifest>;
