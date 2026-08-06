import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { themeFor, type ColorScheme, type Theme } from './theme';

/**
 * How the app decides light or dark.
 *
 * `system` is the default and the honest one: the OS already knows the user's
 * preference, including their schedule for it. The explicit values exist
 * because a settings screen (task 8.1) needs to override it.
 */
export type ThemePreference = ColorScheme | 'system';

type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialPreference = 'system',
}: {
  children: ReactNode;
  initialPreference?: ThemePreference;
}) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] =
    useState<ThemePreference>(initialPreference);

  const value = useMemo<ThemeContextValue>(() => {
    // React Native types this as 'light' | 'dark' | 'unspecified'. The third
    // value is not a scheme, so it needs an answer rather than being passed
    // through. Light is the safer guess: a flash of dark on a light device is
    // more jarring than the reverse.
    const fromSystem: ColorScheme = systemScheme === 'dark' ? 'dark' : 'light';
    const resolved = preference === 'system' ? fromSystem : preference;

    return { theme: themeFor(resolved), preference, setPreference };
  }, [preference, systemScheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Throws outside a provider rather than falling back to a default theme.
 * A silent default would render a component in light colours inside a dark
 * app and look like a styling bug rather than a missing provider.
 */
export function useTheme(): Theme {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within a <ThemeProvider>.');
  }
  return value.theme;
}

/** For a settings screen: read and change the light/dark preference. */
export function useThemePreference(): Omit<ThemeContextValue, 'theme'> {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error(
      'useThemePreference must be used within a <ThemeProvider>.',
    );
  }
  const { preference, setPreference } = value;
  return { preference, setPreference };
}
