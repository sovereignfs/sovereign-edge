import { useEffect, useState } from 'react';
import { ListItem, Toggle, useTheme } from 'desktop-ui';
import {
  listConnectors,
  removeConnector,
  requestCalendarAccess,
  setConnectorGranted,
  type ConnectorStatus,
} from '../lib/tauri';

/**
 * `connectors::search::CONNECTOR_ID` on the Rust side — Search is built
 * into the app rather than store-installed, so it gets "reconfigure," not
 * "remove." No shared constant crosses the IPC boundary for this; hardcoded
 * here the same way mobile's own `ConnectorsScreen.tsx` distinguishes
 * Search by construction rather than a shared id export.
 */
const SEARCH_CONNECTOR_ID = 'fs.sovereign.search';

/**
 * `fs.sovereign.calendar.*` (task 10.2, macOS only) — also built-in, same
 * "reconfigure/no remove" treatment as Search, and additionally needs the
 * real OS permission request (`requestCalendarAccess`) before a grant, per
 * this file's own `toggle()` below.
 */
const CALENDAR_CONNECTOR_ID_PREFIX = 'fs.sovereign.calendar.';

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
 *
 * Task 5.5 adds the store entry point and "Remove" for any store-installed
 * connector — `listConnectors()` itself already includes them, since
 * `known_connector_manifests()` on the Rust side now reads
 * `connectors::installed::read_installed` alongside Search.
 */
export function ConnectorsScreen({
  onNavigate,
}: {
  onNavigate: (destination: 'connectors-setup' | 'connector-store') => void;
}) {
  const theme = useTheme();
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const refresh = async () => {
    const list = await listConnectors();
    setConnectors(list);
    setLoading(false);
  };

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

  async function remove(id: string) {
    setPendingId(id);
    try {
      await removeConnector(id);
      await refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function toggle(id: string, next: boolean) {
    // Calendar connectors need the real OS permission before this app's
    // own grant is allowed to record "granted" — requested once for all
    // four (see `requestCalendarAccess`'s own doc comment), and only on
    // the way to `true`; revoking never needs it.
    if (next && id.startsWith(CALENDAR_CONNECTOR_ID_PREFIX)) {
      const granted = await requestCalendarAccess();
      if (!granted) {
        setCalendarError(
          "Calendar access wasn't allowed. Check this Mac's System Settings to allow it.",
        );
        return;
      }
      setCalendarError(null);
    }

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

      {calendarError ? (
        <p
          style={{
            color: theme.colors.warningText,
            fontSize: theme.fontSize.sm,
            margin: `0 0 ${theme.space[3]}px`,
          }}
        >
          {calendarError}
        </p>
      ) : null}

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
            <div key={connector.id}>
              <ListItem
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
              {connector.id === SEARCH_CONNECTOR_ID ||
              connector.id.startsWith(CALENDAR_CONNECTOR_ID_PREFIX) ? null : (
                <ListItem
                  title="Remove"
                  subtitle={`Uninstall ${connector.name}`}
                  destructive
                  disabled={pendingId === connector.id}
                  onClick={() => void remove(connector.id)}
                />
              )}
            </div>
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

      {loading ? null : (
        <ListItem
          title="Connector Store"
          subtitle="Browse and install third-party connectors"
          onClick={() => onNavigate('connector-store')}
        />
      )}
    </div>
  );
}
