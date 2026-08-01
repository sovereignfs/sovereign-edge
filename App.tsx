import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/design-system';
import { RootNavigator } from '@/settings/navigation/RootNavigator';

export default function App() {
  return (
    // SafeAreaProvider must sit outside the navigator: screens read insets to
    // keep the composer clear of the home indicator.
    <SafeAreaProvider>
      <ThemeProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
