import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { ThemeProvider, useTheme } from '@/design-system';
import { APP_NAME } from '@/shared/app-info';

function Placeholder() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <Text
        style={[
          styles.title,
          {
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize['2xl'],
            fontWeight: theme.fontWeight.semibold,
            fontFamily: theme.fontFamily.body,
          },
        ]}
      >
        {APP_NAME}
      </Text>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          fontFamily: theme.fontFamily.body,
        }}
      >
        Scaffold only — no inference yet.
      </Text>
      {/* `auto` flips the status bar contrast with the scheme; hardcoding it
          would leave dark-on-dark text on one of the two themes. */}
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Placeholder />
    </ThemeProvider>
  );
}

// Only layout lives in StyleSheet: colours and type come from the theme, so
// there is one place to change them and nothing to miss when the scheme flips.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {},
});
