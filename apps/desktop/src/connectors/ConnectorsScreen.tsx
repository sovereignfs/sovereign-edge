import { useEffect, useState } from 'react';
import { ListItem, Toggle, useTheme } from 'desktop-ui';
import {
  listConnectors,
  setConnectorGranted,
  type ConnectorStatus,
} from '../lib/tauri';

/**
 * Task 13.3's own scope: a real settings surface listing every installed
 * connector and its permission state, mirroring mobile task 2.2's own
 * deliverable ("a settings surface listing every installed connector and
 * its current permission state"). Built against `list_connectors` — a
 * real list, not a single hardcoded row — even though today it can only
 * ever return one entry (the embedded Search fixture; desktop has no real
 * connector-install flow yet). `ChatScreen.tsx` keeps its own inline
 * Search toggle unchanged — task 13.5 removes it once this screen is the
 * real thing.
 *
 * Revoking here calls the same `connectors::permissions::revoke` state
 * machine task 12.4 already tested (clears stored credentials, not just
 * the grant flag) — this screen adds no new permission logic, only a real
 * list in front of what already existed.
 */
export function ConnectorsScreen() {
  const theme = useTheme();
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listConnectors();
      if (!cancelled) {
        setConnectors(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(id: string, next: boolean) {
    setPendingId(id);
    setConnectors((prev) =>
      prev.map((c) => (c.id === id ? { ...c, granted: next } : c)),
    );
    try {
      const updated = await setConnectorGranted(id, next);
      setConnectors((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch {
      // Best-effort, matching ChatScreen's own toggle: revert the optimistic
      // flip rather than leave the screen claiming a state that didn't
      // actually take.
      setConnectors((prev) =>
        prev.map((c) => (c.id === id ? { ...c, granted: !next } : c)),
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div style={{ padding: theme.space[4] }}>
      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Connectors</h1>
      <p
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          margin: `${theme.space[2]}px 0 ${theme.space[3]}px`,
        }}
      >
        Nothing reaches the network unless a connector below is granted access.
      </p>

      {loading ? (
        <p style={{ fontSize: theme.fontSize.sm }}>Loading connectors…</p>
      ) : connectors.length === 0 ? (
        <p
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}
        >
          No connectors are available yet.
        </p>
      ) : (
        connectors.map((connector) => (
          <ListItem
            key={connector.id}
            title={connector.name}
            subtitle={
              connector.granted
                ? 'Granted — this connector may reach the network when used.'
                : 'Not granted — this connector cannot reach the network.'
            }
            accessory={
              <Toggle
                value={connector.granted}
                onValueChange={(next) => void toggle(connector.id, next)}
                disabled={pendingId === connector.id}
                aria-label={connector.name}
              />
            }
          />
        ))
      )}
    </div>
  );
}
