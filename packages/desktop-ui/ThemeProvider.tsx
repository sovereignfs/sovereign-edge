import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { themeFor, type ColorScheme, type Theme } from 'design-tokens';

/**
 * How the app decides light or dark — mirrors
 * `apps/mobile/src/design-system/ThemeProvider.tsx`'s own `ThemePreference`.
 * `system` is the default and the honest one: the OS already knows the
 * user's preference. The explicit values exist for a settings screen
 * (not built yet) to override it.
 */
export type ThemePreference = ColorScheme | 'system';

type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** `--sv-*` custom properties covering every token in `Theme`, so component
 * CSS Modules read `var(--sv-color-surface)` etc. and never duplicate a
 * value — the token object stays the single source of truth, generated
 * fresh every render rather than kept in sync with a parallel CSS file by
 * hand. */
function themeToCssVars(theme: Theme): CSSProperties {
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(theme.colors)) {
    vars[`--sv-color-${kebab(key)}`] = value;
  }
  for (const [key, value] of Object.entries(theme.space)) {
    vars[`--sv-space-${key}`] = `${value}px`;
  }
  for (const [key, value] of Object.entries(theme.radius)) {
    vars[`--sv-radius-${key}`] = value === 9999 ? '9999px' : `${value}px`;
  }
  for (const [key, value] of Object.entries(theme.fontSize)) {
    vars[`--sv-font-size-${key}`] = `${value}px`;
  }
  for (const [key, value] of Object.entries(theme.fontWeight)) {
    vars[`--sv-font-weight-${key}`] = `${value}`;
  }
  for (const [key, value] of Object.entries(theme.iconSize)) {
    vars[`--sv-icon-size-${key}`] = `${value}px`;
  }
  vars['--sv-font-family-body'] = theme.fontFamily.body;
  vars['--sv-font-family-mono'] = theme.fontFamily.mono;
  vars['--sv-touch-target-min'] = `${theme.touchTargetMin}px`;
  vars['--sv-motion-duration-fast'] = `${theme.motion.durationFast}ms`;
  vars['--sv-motion-duration-base'] = `${theme.motion.durationBase}ms`;

  return vars as CSSProperties;
}

function kebab(camel: string): string {
  return camel.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function ThemeProvider({
  children,
  initialPreference = 'system',
}: {
  children: ReactNode;
  initialPreference?: ThemePreference;
}) {
  // The web equivalent of RN's `useColorScheme()`: unlike RN's third
  // 'unspecified' value, `matchMedia` always reports a definite boolean, so
  // there's no "inconclusive read" case to default away from here — but the
  // same "light is the safer guess" instinct still applies to `useState`'s
  // own initial value before the effect below has run once.
  const [systemIsDark, setSystemIsDark] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const [preference, setPreference] =
    useState<ThemePreference>(initialPreference);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const fromSystem: ColorScheme = systemIsDark ? 'dark' : 'light';
    const resolved = preference === 'system' ? fromSystem : preference;
    return { theme: themeFor(resolved), preference, setPreference };
  }, [preference, systemIsDark]);

  return (
    <ThemeContext.Provider value={value}>
      <div
        data-sv-theme={value.theme.scheme}
        style={themeToCssVars(value.theme)}
      >
        {children}
      </div>
    </ThemeContext.Provider>
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
