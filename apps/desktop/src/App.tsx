import { useEffect } from 'react';
import { ThemeProvider } from 'desktop-ui';
import { AppShell } from './shell/AppShell';
import { showMainWindow } from './lib/tauri';

export function App() {
  // Task 15.5: `main` starts `"visible": false` (tauri.conf.json) so the
  // separate `splashscreen` window covers the gap before this first paint.
  // Fired once, after mount, not gated on any data load — the splash's job
  // is only covering render latency, not model-load latency (`lib.rs`'s
  // `setup()` already loads the last-used model on a background thread for
  // exactly this reason).
  useEffect(() => {
    void showMainWindow();
  }, []);

  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
