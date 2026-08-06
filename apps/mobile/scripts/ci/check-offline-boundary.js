#!/usr/bin/env node
/**
 * Task 1.5, threat 3: a transitive import out of the offline boundary.
 *
 * ESLint sees one file at a time. It cannot tell that `src/chat/` imports
 * something innocuous which, three hops down, reaches `src/models/download.ts`
 * and its `DownloadTask`. This walks the actual import graph from every file
 * under `src/chat/` and fails if the closure escapes the boundary.
 *
 * Scope is first-party source, deliberately — see "Resolved before
 * implementation" in docs/epics/core-inference-chat.md. A dependency that
 * reaches the network without any first-party file importing it is threat 5
 * and is not covered here; docs/network-audit.md says so plainly.
 *
 * Imports are read with the TypeScript compiler's own preprocessor rather
 * than a regular expression, so `export … from`, type-only imports, and
 * `require()` are all seen the way tsc sees them.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const ENTRY_DIR = path.join(SRC, 'chat');

/** First-party directories `src/chat/` may not reach, at any depth. */
const FORBIDDEN_DIRS = [path.join(SRC, 'models'), path.join(SRC, 'connectors')];

/**
 * Packages that can open a socket. `expo-file-system` is here because it
 * carries `DownloadTask`; `src/models/` uses it legitimately and is already
 * excluded from this walk by FORBIDDEN_DIRS.
 */
const FORBIDDEN_PACKAGES = new Set([
  'expo-file-system',
  'expo-network',
  'expo/fetch',
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
    return EXTENSIONS.includes(path.extname(entry.name)) ? [full] : [];
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
    'src/chat/ is offline by design (research 0001). This import chain',
  );
  console.error('leaves that boundary:\n');
  shown.forEach((step, i) => {
    console.error(`  ${i === 0 ? ' ' : '→'} ${step}`);
  });
  console.error(
    '\nNetwork access belongs in src/connectors/, behind a per-connector',
  );
  console.error(
    'grant. If chat needs something models/ owns, invert the dependency',
  );
  console.error('through ChatSessionContext the way inference already does.');
  console.error('\nSee docs/network-audit.md.');
  process.exit(1);
}

console.log(
  `Offline boundary intact: ${entries.length} files under src/chat/, ` +
    `no path reaches src/models/, src/connectors/, or a networked package.`,
);
