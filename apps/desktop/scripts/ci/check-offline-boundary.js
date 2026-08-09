#!/usr/bin/env node
/**
 * Task 13.9: the desktop port of `apps/mobile/scripts/ci/check-offline-
 * boundary.js` — a fresh feature audit's second-ranked gap. ESLint sees
 * one file at a time; it cannot tell that `src/chat/` imports something
 * innocuous which, three hops down, reaches `src/connectors/runtime/
 * execute.ts`'s network dispatch. This walks the actual import graph from
 * every file under `src/chat/` and fails if the closure escapes the
 * boundary.
 *
 * Unlike mobile, desktop's real network calls all happen in the Rust
 * backend (task 12.9's `net_guard.rs` already guards those at runtime) —
 * the frontend only ever reaches them through `invoke()` IPC via
 * `src/lib/tauri.ts`. So this check's actual job on desktop is narrower
 * but still real: `src/chat/` must not import `src/models/` or
 * `src/connectors/` directly (bypassing the one sanctioned door,
 * `src/lib/tauri.ts`), and must not import a browser HTTP client package
 * directly either, in case one is ever added.
 *
 * Scope is first-party source, deliberately — same call mobile's own
 * script made. A dependency that reaches the network without any
 * first-party file importing it is not covered here;
 * `docs/desktop-network-audit.md` says so plainly.
 *
 * Imports are read with the TypeScript compiler's own preprocessor rather
 * than a regular expression, so `export … from`, type-only imports, and
 * `require()` are all seen the way tsc sees them.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const ENTRY_DIR = path.join(SRC, 'chat');

/** First-party directories `src/chat/` may not reach, at any depth. */
const FORBIDDEN_DIRS = [path.join(SRC, 'models'), path.join(SRC, 'connectors')];

/**
 * Packages that can open a socket directly from the frontend. None of
 * these are dependencies of `apps/desktop` today — real network calls all
 * happen in the Rust backend, reached only via `invoke()` — but this
 * guards against one being added to `src/chat/` later without anyone
 * noticing the boundary it would cross.
 */
const FORBIDDEN_PACKAGES = new Set([
  'axios',
  'node-fetch',
  'undici',
  'superagent',
  'ky',
]);

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return EXTENSIONS.includes(path.extname(entry.name)) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
      ? [full]
      : [];
  });
}

/** Resolves a specifier to a first-party file, or null if it is a package. */
function resolveLocal(specifier, fromFile) {
  let base;
  if (specifier.startsWith('@/')) {
    base = path.join(SRC, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.join(base, `index${ext}`)),
  ];
  return (
    candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null
  );
}

function importsOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  // `readImportedFiles: true` covers import, export-from, and require.
  const info = ts.preProcessFile(text, true, true);
  return info.importedFiles.map((f) => f.fileName);
}

const rel = (p) => path.relative(ROOT, p);

/**
 * Breadth-first so the reported chain is the shortest route out of the
 * boundary — the one a reader can act on, rather than whichever path the
 * traversal happened to take first.
 */
function findEscape(entries) {
  const seen = new Set(entries);
  const queue = entries.map((file) => ({ file, chain: [file] }));

  while (queue.length > 0) {
    const { file, chain } = queue.shift();

    for (const specifier of importsOf(file)) {
      if (FORBIDDEN_PACKAGES.has(specifier)) {
        return { chain: [...chain, specifier], reason: `package` };
      }

      const resolved = resolveLocal(specifier, file);
      if (!resolved) continue;

      const forbidden = FORBIDDEN_DIRS.find((dir) =>
        resolved.startsWith(dir + path.sep),
      );
      if (forbidden) {
        return { chain: [...chain, resolved], reason: `module` };
      }

      if (!seen.has(resolved)) {
        seen.add(resolved);
        queue.push({ file: resolved, chain: [...chain, resolved] });
      }
    }
  }

  return null;
}

const entries = listFiles(ENTRY_DIR);
const escape = findEscape(entries);

if (escape) {
  const [, ...rest] = escape.chain;
  const shown = [escape.chain[0], ...rest].map((step, i) =>
    i === escape.chain.length - 1 && escape.reason === 'package'
      ? step
      : rel(step),
  );

  console.error('Offline boundary violated.\n');
  console.error(
    'src/chat/ only reaches the network through src/lib/tauri.ts (an',
  );
  console.error(
    'invoke() call into the Rust backend, guarded by net_guard.rs).',
  );
  console.error('This import chain leaves that boundary:\n');
  shown.forEach((step, i) => {
    console.error(`  ${i === 0 ? ' ' : '→'} ${step}`);
  });
  console.error(
    '\nIf chat needs something models/ or connectors/ owns, add a typed',
  );
  console.error(
    'wrapper to src/lib/tauri.ts instead of importing the module directly.',
  );
  console.error('\nSee docs/desktop-network-audit.md.');
  process.exit(1);
}

console.log(
  `Offline boundary intact: ${entries.length} files under src/chat/, ` +
    `no path reaches src/models/, src/connectors/, or a networked package.`,
);
