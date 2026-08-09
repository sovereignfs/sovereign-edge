import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { armOfflineTripwire } from '@/chat/session/offlineTripwire';
import { TorchHost } from '@/connectors/device/TorchHost';
import { ThemeProvider } from '@/design-system';
import { ModelSessionProvider } from '@/settings/ModelSessionProvider';
import { RootNavigator } from '@/settings/navigation/RootNavigator';

// Armed at the entry point rather than inside a screen, so the boundary is
// visible where the app is assembled. No-op outside development — see
// src/chat/session/offlineTripwire.ts for why it does not ship.
armOfflineTripwire();

export default function App() {
  return (
    // SafeAreaProvider must sit outside the navigator: screens read insets to
    // keep the composer clear of the home indicator.
    <SafeAreaProvider>
      <ThemeProvider>
        {/* One engine for the whole app — see ModelSessionProvider. */}
        <ModelSessionProvider>
          <RootNavigator />
          {/* Hidden, always-mounted — see TorchHost.tsx's own doc comment
              for why this is safe (no camera permission, no hardware use). */}
          <TorchHost />
          <StatusBar style="auto" />
        </ModelSessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
