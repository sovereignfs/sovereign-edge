#!/usr/bin/env node
// Launches the debug binary desktop.yml just built and fails if it exits
// within the check window — the same "still running N seconds later" bar
// native.yml's own launch checks use for mobile, ported to a plain Node
// script (not bash) so one file behaves identically on macOS, Windows, and
// Linux runners rather than needing three separate shell dialects. ESM, not
// CommonJS: this package is `"type": "module"`.
//
// On Linux this must run under `xvfb-run` (no display server otherwise —
// see Tauri's own CI docs); macOS and Windows runners provide one already.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHECK_WINDOW_MS = 5000;
const BIN_NAME =
  process.platform === 'win32'
    ? 'sovereign-edge-desktop.exe'
    : 'sovereign-edge-desktop';
const BIN_PATH = path.join(
  __dirname,
  '..',
  '..',
  'src-tauri',
  'target',
  'debug',
  BIN_NAME,
);

const child = spawn(BIN_PATH, [], { stdio: 'inherit' });

let exited = false;
child.on('error', (err) => {
  exited = true;
  console.error(`::error::Failed to launch ${BIN_PATH}: ${err.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (exited) return; // already handled by the timeout branch below
  exited = true;
  console.error(
    `::error::App exited within ${CHECK_WINDOW_MS}ms (code ${code}, signal ${signal}) — likely crashed on startup.`,
  );
  process.exitCode = 1;
});

setTimeout(() => {
  if (exited) return;
  // Set before kill(): the 'exit' event this triggers is asynchronous, and
  // without this its handler would see `exited` still false and treat a
  // deliberate, successful shutdown as a crash.
  exited = true;
  console.log('App is running.');
  child.kill();
  process.exitCode = 0;
}, CHECK_WINDOW_MS);
