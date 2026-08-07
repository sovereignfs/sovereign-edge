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
});
