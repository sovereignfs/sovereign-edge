import { useTheme } from 'desktop-ui';

/**
 * Reachable, empty, and honest about it — task 13.2's job is the real
 * model manager (install/remove, download progress, per-device fit).
 * Chat's own model picker still works in the meantime (task 13.5 removes
 * it once this screen is the real thing).
 */
export function ModelsScreen() {
  const theme = useTheme();
  return (
    <div style={{ padding: theme.space[4] }}>
      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Models</h1>
      <p
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          marginTop: theme.space[2],
        }}
      >
        Model management is moving here. Use the model list on the Chat screen
        for now.
      </p>
    </div>
  );
}
