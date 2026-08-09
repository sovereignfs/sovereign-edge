import { useState } from 'react';
import { Button, TextField, useTheme } from 'desktop-ui';
import { setSearchConnectorConfig } from '../lib/tauri';

/**
 * Task 13.6's own screen: a direct port of mobile's
 * `SearchSetupScreen.tsx` — same two fields, same copy, same validation
 * flow (build a candidate config, let the real Rust command's own
 * `validate_manifest` + Tavily-key check reject it, surface whatever error
 * message comes back). Starts blank every time, exactly like mobile: this
 * screen doesn't pre-fill the existing URL or show "a key is already set"
 * on reconfigure either.
 *
 * Desktop has no native-stack "back" affordance the way mobile's
 * `navigation.goBack()` has, so this screen adds an explicit "Cancel"
 * button mobile doesn't need — a deliberate, stated adaptation to
 * desktop's flat navigation, not a missed port.
 */
export function SearchSetupScreen({
  onNavigate,
}: {
  onNavigate: (destination: 'connectors') => void;
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
      onNavigate('connectors');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: theme.colors.surface,
        color: theme.colors.textPrimary,
        minHeight: '100vh',
        fontFamily: theme.fontFamily.body,
        padding: theme.space[4],
        maxWidth: 480,
      }}
    >
      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Search</h1>
      <p
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          marginTop: theme.space[2],
        }}
      >
        Choose which service answers web-search requests. Only one is active at
        a time — switching later will ask you to grant access again, since it is
        a different destination on the network.
      </p>

      <div
        role="radiogroup"
        aria-label="Provider"
        style={{
          display: 'inline-flex',
          gap: theme.space[1],
          marginTop: theme.space[4],
        }}
      >
        {(['searxng', 'tavily'] as const).map((id) => {
          const selected = id === provider;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setProvider(id)}
              style={{
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radius.md,
                padding: `${theme.space[2]}px ${theme.space[3]}px`,
                fontSize: theme.fontSize.sm,
                fontFamily: theme.fontFamily.body,
                cursor: 'pointer',
                background: selected
                  ? theme.colors.accentSubtle
                  : 'transparent',
                color: selected
                  ? theme.colors.accent
                  : theme.colors.textPrimary,
                fontWeight: selected
                  ? theme.fontWeight.semibold
                  : theme.fontWeight.regular,
              }}
            >
              {id === 'searxng' ? 'SearXNG' : 'Tavily'}
            </button>
          );
        })}
      </div>

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

      <div
        style={{
          display: 'flex',
          gap: theme.space[2],
          marginTop: theme.space[4],
        }}
      >
        <Button
          label="Save & enable"
          variant="primary"
          loading={saving}
          onClick={() => void save()}
        />
        <Button
          label="Cancel"
          variant="ghost"
          onClick={() => onNavigate('connectors')}
        />
      </div>
    </div>
  );
}
