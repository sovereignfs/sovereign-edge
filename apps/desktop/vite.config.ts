/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Tauri's own recommended Vite shape (task 12.1).
 *
 * The fixed port and `strictPort` matter: `tauri dev` starts this dev server
 * and then points its webview at a hardcoded URL (`build.devUrl` in
 * `src-tauri/tauri.conf.json`) — a silently-reassigned port would make the
 * window load nothing rather than fail loudly.
 */

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],

  // Tauri expects its own stderr/stdout, so this prevents Vite from
  // obscuring Rust errors with a clear-screen on every reload.
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    // Editing Rust source must not trigger a frontend reload.
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },

  // Task 13.8's own scope: `pnpm test` (Vitest, reusing this same Vite
  // config rather than a parallel Jest setup mobile uses — desktop is
  // already Vite-based, so a second bundler/config for tests would be the
  // dependency this app doesn't need, the same call task 12.6 made about
  // a styling library). `jsdom` because these are DOM-rendering component
  // tests, not Node-only unit tests.
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
  },
});
