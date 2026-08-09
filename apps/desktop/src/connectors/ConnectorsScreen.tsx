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
 * its current permission state"). `ChatScreen.tsx` keeps its own inline
 * Search toggle unchanged — task 13.5 removes it once this screen is the
 * real thing.
 *
 * Revoking here calls the same `connectors::permissions::revoke` state
 * machine task 12.4 already tested (clears stored credentials, not just
 * the grant flag) — this screen adds no new permission logic, only a real
 * list in front of what already existed.
 *
 * Task 13.6 adds the empty/reconfigure rows, ported from mobile's own
 * `ConnectorsScreen.tsx`: `listConnectors()` now genuinely returns `[]`
 * until Search is configured (task 13.6's own change to
 * `known_connector_manifests` on the Rust side), so the empty state below
 * isn't a placeholder for "no connectors exist yet" anymore — it's the
 * real, reachable "set one up" entry point mobile's screen already has.
 */
export function ConnectorsScreen({
  onNavigate,
}: {
  onNavigate: (destination: 'connectors-setup') => void;
}) {
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

  const empty = connectors.length === 0;

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
      ) : empty ? (
        <ListItem
          title="Search"
          subtitle="Not set up — tap to choose a provider"
          onClick={() => onNavigate('connectors-setup')}
        />
      ) : (
        <>
          {connectors.map((connector) => (
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
          ))}
          {/* A way back into setup once configured — without this, fixing a
              mistyped URL or key means revoke-then-grant, which re-offers
              the same (wrong) stored credential rather than letting the
              user enter a new one. Mirrors mobile's own reconfigure row. */}
          <ListItem
            title="Change provider or key"
            subtitle="Reconfigure Search"
            onClick={() => onNavigate('connectors-setup')}
          />
        </>
      )}
    </div>
  );
}
