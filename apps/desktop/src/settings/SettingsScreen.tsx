import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  Button,
  Icon,
  ListItem,
  SectionLabel,
  SegmentedControl,
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
 * component set does not have yet"). Task 15.4 gives `desktop-ui` that
 * component (`SegmentedControl`) and this screen switches to it — same
 * `role="radiogroup"`/`role="radio"`/`aria-checked` shape the hand-rolled
 * version already used, so no existing query needed to change.
 *
 * No new state to manage: `useThemePreference()` reads/writes the same
 * `ThemeProvider` context every other screen already renders under
 * (`App.tsx` wraps `AppShell`, not each screen individually), so a change
 * here is live everywhere immediately — nothing to propagate by hand.
 *
 * Task 12.11 adds the Privacy/"Offline by design" section, ported from
 * mobile's own `SettingsScreen.tsx` — a fresh feature audit found desktop
 * had no equivalent reassurance copy even though the same offline-by-
 * design guarantee (`AGENTS.md`'s hard rule, `docs/desktop-network-
 * audit.md`) applies here identically. Desktop's own subtitle wording is
 * deliberately narrower than mobile's literal "Nothing can reach the
 * network" — model downloads and a granted connector *do* reach the
 * network, same as mobile's own claim really means once you read
 * `docs/network-audit.md`'s actual scope — so this mirrors the honest
 * phrasing `ChatScreen.tsx`'s own header banner already uses rather than
 * repeating mobile's looser sentence verbatim.
 */

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'not-available' }
  | { kind: 'available'; update: Update }
  | { kind: 'installing' }
  | { kind: 'error'; message: string };

export function SettingsScreen({
  onNavigate,
}: {
  onNavigate: (destination: 'connectors') => void;
}) {
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

  // `ListItem`/`SectionLabel` both carry their own horizontal padding
  // (matching `ModelsScreen.tsx`'s own layout, task 15.3) — everything
  // else in this screen (the title, the segmented control, freeform
  // paragraphs) needs it applied explicitly, since the outer container no
  // longer provides it uniformly the way the old single-`<div>` layout did.
  const inset = { padding: `0 ${theme.space[4]}px` };

  return (
    <div>
      <div style={{ ...inset, paddingTop: theme.space[4] }}>
        <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Settings</h1>
      </div>

      <section>
        <SectionLabel>Appearance</SectionLabel>
        <div style={{ ...inset, paddingBottom: theme.space[2] }}>
          <SegmentedControl
            options={THEME_OPTIONS}
            value={preference}
            onChange={setPreference}
            aria-label="Theme"
          />
        </div>
        <p
          style={{
            ...inset,
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            margin: 0,
            paddingBottom: theme.space[2],
          }}
        >
          System follows this machine's own light/dark setting.
        </p>
      </section>

      <section>
        <SectionLabel>Privacy</SectionLabel>
        <ListItem
          title="Connectors"
          subtitle="The only way anything here reaches the network"
          onClick={() => onNavigate('connectors')}
          accessory={
            <Icon name="chevron-right" size="sm" color={theme.colors.textSubtle} aria-hidden />
          }
        />
      </section>

      <section>
        <SectionLabel>About</SectionLabel>
        <p
          style={{
            ...inset,
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            margin: 0,
            paddingBottom: theme.space[2],
          }}
        >
          {version ? `Sovereign Edge ${version}` : 'Sovereign Edge'}
        </p>
        <ListItem
          title="Offline by design"
          subtitle="Sovereign Edge has no network code in its chat path."
        />

        <div style={{ ...inset, paddingTop: theme.space[3] }}>
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
