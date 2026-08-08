/**
 * `packages/desktop-ui` — the component set `apps/desktop`'s chat UI
 * (task 12.7) is built from, matching `apps/mobile/src/design-system`'s
 * shape (task 12.6). See that package's own README for the full rationale.
 */

export {
  ThemeProvider,
  useTheme,
  useThemePreference,
  type ThemePreference,
} from './ThemeProvider';
export * from './components';
