import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A relative import into the built package, not the bare specifier
// `@sovereignfs/connector-sdk` — that maps (via the package's own
// `exports` field) to raw TypeScript source meant for a bundler-aware
// consumer (Vite, Metro), which plain Node cannot resolve on its own.
// This script is exactly the kind of consumer `publishConfig.exports`
// exists for: run `pnpm --filter @sovereignfs/connector-sdk build`
// first (the `registry:validate` root script always does).
import { validateManifest } from '../packages/connector-sdk/dist/index.js';

/**
 * Registry validation (task 5.4).
 *
 * Unlike `sovereign`'s `registry/plugins.json` — which points at external
 * git repositories shipping real code, so validation has to clone the
 * source, check its manifest, and pin a content hash against drift — a
 * Sovereign Edge connector registry entry embeds the connector's manifest
 * directly. There is no external source to fetch or drift from: the
 * manifest in the PR diff *is* the submission, and the PR's own review is
 * the provenance. That's what makes Tier 1/Tier 2 connectors a lighter
 * review burden than the plugin registry's native-code submissions, per
 * this task's own review checklist.
 *
 * `validateManifest` (the same function, and the same code, the app itself
 * loads connectors with — see packages/connector-sdk) already enforces the
 * property this task's review checklist calls out explicitly: a manifest
 * whose `request.origin` is not also listed in
 * `permissions.network.origins` is rejected. A submission that "lies about
 * its declared network domain" cannot pass schema validation, full stop —
 * it's not a manual review step here, it's structural.
 *
 * What schema validation does *not* catch, and stays a human PR-review
 * judgment (see CONTRIBUTING.md): whether the declared `pricing` is
 * honest, and whether `tool.description`/`parameters` are a sane,
 * non-misleading description of what the connector actually does.
 */

export function validateRegistry(registry) {
  const errors = [];

  if (registry.registryVersion !== 1) {
    errors.push(
      `registryVersion must be 1, got ${JSON.stringify(registry.registryVersion)}`,
    );
    return { valid: false, errors };
  }

  if (!Array.isArray(registry.connectors)) {
    errors.push('connectors must be an array');
    return { valid: false, errors };
  }

  const seenIds = new Set();

  registry.connectors.forEach((entry, index) => {
    const at = `connectors[${index}]`;

    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      errors.push(`${at}.id must be a non-empty string`);
    } else if (seenIds.has(entry.id)) {
      errors.push(`${at}.id "${entry.id}" is already used by another entry`);
    } else {
      seenIds.add(entry.id);
    }

    if (
      !entry.submittedBy ||
      typeof entry.submittedBy.name !== 'string' ||
      entry.submittedBy.name.length === 0
    ) {
      errors.push(`${at}.submittedBy.name is required`);
    }

    if (!entry.manifest || typeof entry.manifest !== 'object') {
      errors.push(`${at}.manifest is required`);
      return;
    }

    if (entry.manifest.id !== entry.id) {
      errors.push(
        `${at}.manifest.id ("${entry.manifest.id}") must match ${at}.id ("${entry.id}")`,
      );
    }

    const result = validateManifest(entry.manifest);
    if (!result.valid) {
      for (const issue of result.issues) {
        errors.push(
          `${at}.manifest (${entry.id}): ${issue.path}: ${issue.message}`,
        );
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

function main() {
  const registryPath = fileURLToPath(
    new URL('./connectors.json', import.meta.url),
  );
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));

  const result = validateRegistry(registry);
  if (result.valid) {
    console.log(
      `registry/connectors.json is valid: ${registry.connectors.length} entries.`,
    );
    process.exit(0);
  }

  console.error('registry/connectors.json is invalid:');
  for (const error of result.errors) {
    console.error(`  ${error}`);
  }
  process.exit(1);
}

// Only run as a CLI when invoked directly — validate.test.mjs imports
// `validateRegistry` without triggering this.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
