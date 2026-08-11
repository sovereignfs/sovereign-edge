import { useEffect, useState } from 'react';
import {
  Button,
  FitBadge,
  Icon,
  ListItem,
  SectionLabel,
  SegmentedControl,
  TextField,
  useTheme,
  type FitBadgeVariant,
} from 'desktop-ui';
import {
  listConnectors,
  removeConnector,
  requestCalendarAccess,
  setConnectorGranted,
  setSearchConnectorConfig,
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
 * `ConnectorsScreen.tsx`. Task 5.5 adds the store entry point and "Remove"
 * for any store-installed connector.
 *
 * Task 15.4 restructures this into sections (Search/Calendar/Installed —
 * desktop has no Device tier, unlike mobile) with a status `FitBadge` and
 * a chevron replacing the inline `Toggle`, and folds `SearchSetupScreen`
 * in as this screen's own Search detail view — mirroring mobile's task
 * 7.7 restructure, kept as one file with an inline list/detail toggle
 * (`selected` state) rather than a second `AppShell` destination, the
 * same pattern `ConnectorStoreScreen.tsx` already established for its own
 * list/install-detail split.
 *
 * One deliberate scope reduction from mobile's own `ConnectorDetailScreen`:
 * there is no "Reaches" section here. `ConnectorStatus` (this app's own
 * `list_connectors`/`connector_status` DTO) is only ever `{ id, name,
 * granted }` — no scope/origin data crosses the IPC boundary for an
 * already-configured connector the way a full `ConnectorManifest` does at
 * install time (`ConnectorStoreScreen.tsx`'s own detail view *can* show
 * scope, because it still has the manifest in hand). Showing scope here
 * would mean inventing data this screen doesn't actually have.
 */

function pillFor(granted: boolean): {
  label: string;
  variant: FitBadgeVariant;
} {
  return granted
    ? { label: 'Allowed', variant: 'good' }
    : { label: 'Not granted', variant: 'neutral' };
}

type Selected = { kind: 'search' } | { kind: 'connector'; id: string };

export function ConnectorsScreen({
  onNavigate,
}: {
  onNavigate: (destination: 'connector-store') => void;
}) {
  const theme = useTheme();
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

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

  const searchStatus =
    connectors.find((c) => c.id === SEARCH_CONNECTOR_ID) ?? null;
  const calendarRows = connectors.filter((c) =>
    c.id.startsWith(CALENDAR_CONNECTOR_ID_PREFIX),
  );
  const installedRows = connectors.filter(
    (c) =>
      c.id !== SEARCH_CONNECTOR_ID &&
      !c.id.startsWith(CALENDAR_CONNECTOR_ID_PREFIX),
  );
  const empty = connectors.length === 0;

  if (selected?.kind === 'search') {
    return (
      <SearchDetail
        status={searchStatus}
        pending={pendingId === SEARCH_CONNECTOR_ID}
        onBack={() => setSelected(null)}
        onToggle={(next) => void toggle(SEARCH_CONNECTOR_ID, next)}
        onSaved={refresh}
      />
    );
  }

  if (selected?.kind === 'connector') {
    const status = connectors.find((c) => c.id === selected.id);
    if (status) {
      return (
        <ConnectorDetail
          status={status}
          installed={installedRows.some((c) => c.id === status.id)}
          pending={pendingId === status.id}
          calendarError={
            status.id.startsWith(CALENDAR_CONNECTOR_ID_PREFIX)
              ? calendarError
              : null
          }
          onBack={() => setSelected(null)}
          onToggle={(next) => void toggle(status.id, next)}
          onRemove={() => void remove(status.id).then(() => setSelected(null))}
        />
      );
    }
  }

  const chevron = (
    <Icon
      name="chevron-right"
      size="sm"
      color={theme.colors.textSubtle}
      aria-hidden
    />
  );

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
          onClick={() => setSelected({ kind: 'search' })}
        />
      ) : (
        <>
          <SectionLabel>Search</SectionLabel>
          <ListItem
            title="Search"
            subtitle={searchStatus ? undefined : 'Not set up'}
            accessory={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.space[2],
                }}
              >
                <FitBadge {...pillFor(searchStatus?.granted ?? false)} />
                {chevron}
              </div>
            }
            onClick={() => setSelected({ kind: 'search' })}
          />

          {calendarRows.length > 0 ? (
            <>
              <SectionLabel>Calendar</SectionLabel>
              {calendarRows.map((c) => (
                <ListItem
                  key={c.id}
                  title={c.name}
                  accessory={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: theme.space[2],
                      }}
                    >
                      <FitBadge {...pillFor(c.granted)} />
                      {chevron}
                    </div>
                  }
                  onClick={() => setSelected({ kind: 'connector', id: c.id })}
                />
              ))}
            </>
          ) : null}

          {installedRows.length > 0 ? (
            <>
              <SectionLabel>Installed</SectionLabel>
              {installedRows.map((c) => (
                <ListItem
                  key={c.id}
                  title={c.name}
                  accessory={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: theme.space[2],
                      }}
                    >
                      <FitBadge {...pillFor(c.granted)} />
                      {chevron}
                    </div>
                  }
                  onClick={() => setSelected({ kind: 'connector', id: c.id })}
                />
              ))}
            </>
          ) : null}
        </>
      )}

      {loading ? null : (
        <ListItem
          title="Connector Store"
          subtitle="Browse and install third-party connectors"
          accessory={chevron}
          onClick={() => onNavigate('connector-store')}
        />
      )}
    </div>
  );
}

function DetailHeader({
  title,
  pill,
}: {
  title: string;
  pill: { label: string; variant: FitBadgeVariant };
}) {
  const theme = useTheme();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space[3],
        marginBottom: theme.space[4],
      }}
    >
      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>{title}</h1>
      <FitBadge {...pill} />
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        background: 'none',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: theme.space[1],
        color: theme.colors.accent,
        fontSize: theme.fontSize.sm,
        fontFamily: theme.fontFamily.body,
        cursor: 'pointer',
        padding: 0,
        marginBottom: theme.space[3],
      }}
    >
      ← Back to Connectors
    </button>
  );
}

/**
 * Calendar row or store-installed connector detail — grant state and a
 * revoke/grant action, plus Remove for a store-installed one. No "Reaches"
 * section — see this file's own top comment for why.
 */
function ConnectorDetail({
  status,
  installed,
  pending,
  calendarError,
  onBack,
  onToggle,
  onRemove,
}: {
  status: ConnectorStatus;
  installed: boolean;
  pending: boolean;
  calendarError: string | null;
  onBack: () => void;
  onToggle: (next: boolean) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();

  return (
    <div style={{ padding: theme.space[4], maxWidth: 480 }}>
      <BackLink onBack={onBack} />
      <DetailHeader title={status.name} pill={pillFor(status.granted)} />

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

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.space[2],
        }}
      >
        {status.granted ? (
          <Button
            label="Revoke access"
            variant="danger"
            disabled={pending}
            onClick={() => onToggle(false)}
          />
        ) : (
          <Button
            label="Grant access"
            disabled={pending}
            onClick={() => onToggle(true)}
          />
        )}
        {installed ? (
          <Button
            label="Remove connector"
            variant="danger"
            disabled={pending}
            onClick={onRemove}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Folds `SearchSetupScreen`'s first-run flow in as this screen's own
 * Search detail view (task 15.4) — same two fields, same copy, same
 * validation flow as the now-retired standalone screen. `status === null`
 * means Search has never been configured; the form is otherwise identical
 * either way; saving both configures and grants in one step
 * (`set_search_connector_config` does the grant on the Rust side, same as
 * it always did).
 */
function SearchDetail({
  status,
  pending,
  onBack,
  onToggle,
  onSaved,
}: {
  status: ConnectorStatus | null;
  pending: boolean;
  onBack: () => void;
  onToggle: (next: boolean) => void;
  onSaved: () => void;
}) {
  const theme = useTheme();
  const [provider, setProvider] = useState<'searxng' | 'tavily'>('searxng');
  const [searxngUrl, setSearxngUrl] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await setSearchConnectorConfig(
        provider === 'searxng'
          ? { provider: 'searxng', searxng_url: searxngUrl.trim() }
          : { provider: 'tavily', tavily_key: tavilyKey.trim() },
      );
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: theme.space[4], maxWidth: 480 }}>
      <BackLink onBack={onBack} />
      <DetailHeader
        title="Search"
        pill={
          status
            ? pillFor(status.granted)
            : { label: 'Not set up', variant: 'neutral' }
        }
      />

      <p
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          margin: `0 0 ${theme.space[4]}px`,
        }}
      >
        Choose which service answers web-search requests. Only one is active at
        a time — switching later will ask you to grant access again, since it is
        a different destination on the network.
      </p>

      {status ? (
        <div style={{ marginBottom: theme.space[4] }}>
          {status.granted ? (
            <Button
              label="Revoke access"
              variant="danger"
              disabled={pending}
              onClick={() => onToggle(false)}
            />
          ) : (
            <Button
              label="Grant access"
              disabled={pending}
              onClick={() => onToggle(true)}
            />
          )}
        </div>
      ) : null}

      <SegmentedControl
        options={[
          { value: 'searxng', label: 'SearXNG' },
          { value: 'tavily', label: 'Tavily' },
        ]}
        value={provider}
        onChange={(next) => {
          setProvider(next);
          setError(null);
        }}
        aria-label="Provider"
      />

      <div style={{ marginTop: theme.space[4] }}>
        {provider === 'searxng' ? (
          <TextField
            label="Instance URL"
            placeholder="https://your-instance.example.org"
            value={searxngUrl}
            onChange={(e) => setSearxngUrl(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            hint="Self-hosted, or one you trust. Must be https — this app never relaxes that, even for your own network."
          />
        ) : (
          <TextField
            label="Tavily API key"
            placeholder="tvly-..."
            type="password"
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            hint="Stored in the device keychain, scoped to this connector only."
          />
        )}
      </div>

      {error && (
        <p
          style={{
            color: theme.colors.errorText,
            fontSize: theme.fontSize.sm,
            marginTop: theme.space[2],
          }}
        >
          {error}
        </p>
      )}

      <div style={{ marginTop: theme.space[4] }}>
        <Button
          label={status ? 'Save changes' : 'Save & grant access'}
          variant={status ? 'secondary' : 'primary'}
          loading={saving}
          onClick={() => void save()}
        />
      </div>
    </div>
  );
}
