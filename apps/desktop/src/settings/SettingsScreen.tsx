import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  Button,
  useTheme,
  useThemePreference,
  type ThemePreference,
} from 'desktop-ui';

/**
 * Task 13.4's own scope: expose `ThemeProvider`'s existing `system`/
 * `light`/`dark` preference (built in task 12.6, never wired to a control
 * since) as a real, mutually-exclusive control — not three independent
 * toggles, the exact "reads oddly" gap mobile's own task 8.1 flagged and
 * left open in its equivalent screen ("it wants a radio control the
 * component set does not have yet"). `packages/desktop-ui` still has no
 * dedicated radio-group component, so this is a plain `role="radiogroup"`
 * built from styled buttons — the same "no new component for one screen"
 * call `AppShell.tsx`'s own nav buttons already made.
 *
 * No new state to manage: `useThemePreference()` reads/writes the same
 * `ThemeProvider` context every other screen already renders under
 * (`App.tsx` wraps `AppShell`, not each screen individually), so a change
 * here is live everywhere immediately — nothing to propagate by hand.
 */

const OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'not-available' }
  | { kind: 'available'; update: Update }
  | { kind: 'installing' }
  | { kind: 'error'; message: string };

export function SettingsScreen() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const [version, setVersion] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        // No Tauri runtime to answer this in a plain browser preview —
        // the version line just stays blank rather than showing a lie.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deliberately manual, not polled on mount or on an interval: this app's
  // architectural posture (root AGENTS.md's hard rules) is that network
  // calls happen on explicit user action, not silently in the background.
  // An update check isn't one of the rules' enumerated exceptions
  // (chat/model code, model acquisition) — nothing requires this
  // conservatism here — but it's the same posture applied consistently
  // rather than a network call this app makes on every launch unasked.
  async function handleCheckForUpdates() {
    setUpdateState({ kind: 'checking' });
    try {
      const update = await check();
      setUpdateState(
        update ? { kind: 'available', update } : { kind: 'not-available' },
      );
    } catch (cause) {
      setUpdateState({
        kind: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  async function handleInstallUpdate(update: Update) {
    setUpdateState({ kind: 'installing' });
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (cause) {
      setUpdateState({
        kind: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return (
    <div style={{ padding: theme.space[4] }}>
      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Settings</h1>

      <section style={{ marginTop: theme.space[4] }}>
        <h2
          style={{
            fontSize: theme.fontSize.md,
            fontWeight: theme.fontWeight.semibold,
            margin: 0,
            marginBottom: theme.space[2],
          }}
        >
          Theme
        </h2>
        <div
          role="radiogroup"
          aria-label="Theme"
          style={{ display: 'inline-flex', gap: theme.space[1] }}
        >
          {OPTIONS.map((option) => {
            const selected = option.id === preference;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPreference(option.id)}
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
                {option.label}
              </button>
            );
          })}
        </div>
        <p
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            marginTop: theme.space[2],
          }}
        >
          System follows this machine's own light/dark setting.
        </p>
      </section>

      <section style={{ marginTop: theme.space[6] }}>
        <h2
          style={{
            fontSize: theme.fontSize.md,
            fontWeight: theme.fontWeight.semibold,
            margin: 0,
            marginBottom: theme.space[2],
          }}
        >
          About
        </h2>
        <p
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.sm }}
        >
          {version ? `Sovereign Edge ${version}` : 'Sovereign Edge'}
        </p>

        <div style={{ marginTop: theme.space[2] }}>
          {updateState.kind === 'available' ? (
            <Button
              label={`Download and Install v${updateState.update.version}`}
              size="sm"
              onClick={() => handleInstallUpdate(updateState.update)}
            />
          ) : (
            <Button
              label="Check for Updates"
              size="sm"
              variant="secondary"
              loading={updateState.kind === 'checking'}
              onClick={handleCheckForUpdates}
            />
          )}
          {updateState.kind === 'installing' && (
            <p
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.sm,
                marginTop: theme.space[1],
              }}
            >
              Downloading and installing — the app will relaunch automatically.
            </p>
          )}
          {updateState.kind === 'not-available' && (
            <p
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.sm,
                marginTop: theme.space[1],
              }}
            >
              You're on the latest version.
            </p>
          )}
          {updateState.kind === 'error' && (
            <p
              style={{
                color: theme.colors.errorText,
                fontSize: theme.fontSize.sm,
                marginTop: theme.space[1],
              }}
            >
              Update check failed: {updateState.message}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
