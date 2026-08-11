import { useEffect, useState } from 'react';
import { Button, ListItem, TextField, useTheme } from 'desktop-ui';

import {
  fetchConnectorRegistry,
  installConnector,
  type RegistryConnectorDto,
} from '../lib/tauri';

/**
 * Browse the public connector registry (task 5.4) and install one (task
 * 5.5) — the desktop counterpart to mobile's `ConnectorStoreScreen.tsx`/
 * `ConnectorInstallScreen.tsx`, kept as one file with an inline
 * list/detail toggle rather than a second destination — the same pattern
 * `ConnectorsScreen.tsx` uses for its own connector detail views (task
 * 15.4).
 *
 * This is the first screen in the app that needs the internet for its own
 * sake, not a granted connector's — said plainly below rather than
 * fetching silently, since every other screen here works fully offline.
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; connectors: RegistryConnectorDto[] };

export function ConnectorStoreScreen({
  onNavigate,
}: {
  onNavigate: (destination: 'connectors') => void;
}) {
  const theme = useTheme();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RegistryConnectorDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchConnectorRegistry().then(
      (connectors) => {
        if (!cancelled) setState({ kind: 'loaded', connectors });
      },
      (cause) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (selected) {
    return (
      <ConnectorInstallDetail
        connector={selected}
        onBack={() => setSelected(null)}
        onInstalled={() => onNavigate('connectors')}
      />
    );
  }

  const visible =
    state.kind === 'loaded'
      ? state.connectors
          // Tier 3 dispatches to a handler already registered inside the
          // app — a third-party submission can declare it, but nothing
          // in the store could ever make it work.
          .filter((c) => c.manifest.tier === 1)
          .filter((c) => c.manifest.platforms.includes('desktop'))
          .filter((c) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return (
              c.manifest.name.toLowerCase().includes(q) ||
              c.manifest.summary.toLowerCase().includes(q)
            );
          })
      : [];

  return (
    <div style={{ padding: theme.space[4] }}>
      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>
        Connector Store
      </h1>
      <p
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          margin: `${theme.space[2]}px 0 ${theme.space[3]}px`,
        }}
      >
        This screen fetches the public connector registry from the internet —
        the one place in this app that reaches the network for its own sake, not
        a connector you have already granted. Nothing is installed or granted
        until you choose one and confirm.
      </p>

      {state.kind === 'loaded' && state.connectors.length > 0 ? (
        <div style={{ marginBottom: theme.space[3] }}>
          <TextField
            aria-label="Search"
            placeholder="Filter by name or description"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <p style={{ fontSize: theme.fontSize.sm }}>
          Loading the connector registry…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p
          style={{ color: theme.colors.errorText, fontSize: theme.fontSize.sm }}
        >
          {state.message}
        </p>
      ) : null}

      {state.kind === 'loaded' && visible.length === 0 ? (
        <p
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}
        >
          {state.connectors.length === 0
            ? 'The registry has no listings right now.'
            : 'No connectors match this search.'}
        </p>
      ) : null}

      {visible.map((connector) => {
        const paid = connector.manifest.pricing.model === 'paid';
        return (
          <ListItem
            key={connector.id}
            title={connector.manifest.name}
            subtitle={
              paid
                ? `${connector.manifest.summary} · not yet supported`
                : connector.manifest.summary
            }
            disabled={paid}
            onClick={paid ? undefined : () => setSelected(connector)}
          />
        );
      })}
    </div>
  );
}

/**
 * Install detail — "install" here means exactly what `ConnectorsScreen`'s
 * own `SearchDetail` does for the first-party Search connector: validate →
 * write any declared credentials to the vault → grant → persist, epic
 * 2.2's consent model reused completely unchanged. The Rust
 * `install_connector` command does the validation/grant/persist; this
 * component's own job is
 * just collecting any declared credentials first.
 */
function ConnectorInstallDetail({
  connector,
  onBack,
  onInstalled,
}: {
  connector: RegistryConnectorDto;
  onBack: () => void;
  onInstalled: () => void;
}) {
  const theme = useTheme();
  const { manifest, submittedByName } = connector;

  const credentialDefs =
    manifest.tier === 1 ? (manifest.permissions.credentials ?? []) : [];

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const scope =
    manifest.tier === 1
      ? manifest.permissions.network.origins
      : manifest.permissions.device.capabilities;

  async function install() {
    setError(null);
    for (const cred of credentialDefs) {
      if (!values[cred.key]?.trim()) {
        setError(`Enter ${cred.label}.`);
        return;
      }
    }

    setInstalling(true);
    try {
      const credentials: Record<string, string> = {};
      for (const cred of credentialDefs) {
        credentials[cred.key] = values[cred.key]!.trim();
      }
      await installConnector(manifest, credentials);
      onInstalled();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div style={{ padding: theme.space[4] }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.accent,
          fontSize: theme.fontSize.sm,
          fontFamily: theme.fontFamily.body,
          cursor: 'pointer',
          padding: 0,
          marginBottom: theme.space[3],
        }}
      >
        ← Back to store
      </button>

      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>
        {manifest.name}
      </h1>
      <p
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          margin: `${theme.space[1]}px 0`,
        }}
      >
        {manifest.summary}
      </p>
      <p
        style={{
          color: theme.colors.textSubtle,
          fontSize: theme.fontSize.caption,
          margin: `0 0 ${theme.space[3]}px`,
        }}
      >
        Submitted by {submittedByName}
      </p>

      <div style={{ marginBottom: theme.space[3] }}>
        <p style={{ fontSize: theme.fontSize.sm, margin: 0 }}>
          {manifest.tier === 1 ? 'Reaches' : 'Uses device capabilities'}
        </p>
        <p
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.mono,
            margin: `${theme.space[1]}px 0 0`,
          }}
        >
          {scope.join(', ')}
        </p>
      </div>

      {credentialDefs.map((cred) => (
        <div key={cred.key} style={{ marginBottom: theme.space[3] }}>
          <TextField
            label={cred.label}
            type="password"
            value={values[cred.key] ?? ''}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [cred.key]: e.target.value }))
            }
            hint="Stored in the OS keychain, scoped to this connector only."
            error={error ?? undefined}
          />
        </div>
      ))}

      {credentialDefs.length === 0 && error ? (
        <p
          style={{
            color: theme.colors.errorText,
            fontSize: theme.fontSize.sm,
            marginBottom: theme.space[3],
          }}
        >
          {error}
        </p>
      ) : null}

      <Button
        label="Install & grant"
        onClick={() => void install()}
        loading={installing}
        fullWidth
      />
    </div>
  );
}
