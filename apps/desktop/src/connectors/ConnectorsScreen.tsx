import { useTheme } from 'desktop-ui';

/**
 * Reachable, empty, and honest about it — task 13.3's job is a real
 * per-connector list with grant/revoke. Mirrors
 * `apps/mobile/src/App.tsx`'s own Connectors screen shipping empty until
 * a later task filled it in: the empty state states the product's central
 * claim, which is true today. Chat's own connector toggle still works in
 * the meantime (task 13.5 removes it once this screen is the real thing).
 */
export function ConnectorsScreen() {
  const theme = useTheme();
  return (
    <div style={{ padding: theme.space[4] }}>
      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Connectors</h1>
      <p
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          marginTop: theme.space[2],
        }}
      >
        Nothing reaches the network unless a connector is granted access. Manage
        that from the Chat screen for now — a full connector list is moving
        here.
      </p>
    </div>
  );
}
