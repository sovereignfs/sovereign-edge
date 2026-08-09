#!/usr/bin/env node
// Task 14.4's own tool: rewrites the three version fields a desktop
// release needs in sync (`package.json`, `src-tauri/Cargo.toml`,
// `src-tauri/tauri.conf.json` — all still `0.0.0` since task 12.1's
// scaffold, per ROADMAP.md's own flagged gap). Targeted regex replace on
// each file's own `version` line, not a JSON.parse/stringify or TOML
// round-trip, which would reformat unrelated fields/comments (the
// `Cargo.toml` file has hand-written comments above its dependency
// blocks that a TOML library round-trip is not guaranteed to preserve
// byte-for-byte) — the same targeted approach task 14.3's own scratch
// verification used by hand with `sed` before this script existed.
//
// Usage: node scripts/bump-version.mjs 0.1.0
// Run from anywhere; paths below are relative to this file, not cwd.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.join(__dirname, '..');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `::error::Usage: bump-version.mjs <major.minor.patch> — got ${JSON.stringify(version ?? '')}`,
  );
  process.exitCode = 1;
  process.exit();
}

function replaceOnce(filePath, pattern, replacement) {
  const before = readFileSync(filePath, 'utf8');
  if (!pattern.test(before)) {
    console.error(`::error::${filePath}: version field pattern not found`);
    process.exitCode = 1;
    process.exit();
  }
  const after = before.replace(pattern, replacement);
  writeFileSync(filePath, after);
  console.log(`Updated ${path.relative(DESKTOP_ROOT, filePath)} -> ${version}`);
}

replaceOnce(
  path.join(DESKTOP_ROOT, 'package.json'),
  /"version": "\d+\.\d+\.\d+"/,
  `"version": "${version}"`,
);

replaceOnce(
  path.join(DESKTOP_ROOT, 'src-tauri', 'Cargo.toml'),
  /^version = "\d+\.\d+\.\d+"/m,
  `version = "${version}"`,
);

replaceOnce(
  path.join(DESKTOP_ROOT, 'src-tauri', 'tauri.conf.json'),
  /"version": "\d+\.\d+\.\d+"/,
  `"version": "${version}"`,
);
