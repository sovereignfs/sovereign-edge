import { ThemeProvider } from 'desktop-ui';
import { AppShell } from './shell/AppShell';

export function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
