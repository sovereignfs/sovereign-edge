import { useTheme } from 'desktop-ui';

/**
 * Reachable, empty, and honest about it — task 13.4's job is exposing
 * `ThemeProvider`'s existing `system`/`light`/`dark` preference as a real
 * control, plus app/version info.
 */
export function SettingsScreen() {
  const theme = useTheme();
  return (
    <div style={{ padding: theme.space[4] }}>
      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Settings</h1>
      <p
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          marginTop: theme.space[2],
        }}
      >
        Theme and app preferences are moving here.
      </p>
    </div>
  );
}
