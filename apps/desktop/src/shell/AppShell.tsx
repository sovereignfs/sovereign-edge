import { useState } from 'react';
import { useTheme } from 'desktop-ui';
import { ChatScreen } from '../chat/ChatScreen';
import { ModelsScreen } from '../models/ModelsScreen';
import { ConnectorsScreen } from '../connectors/ConnectorsScreen';
import { SearchSetupScreen } from '../connectors/SearchSetupScreen';
import { SettingsScreen } from '../settings/SettingsScreen';

/**
 * Task 13.1's own scope: the chrome and route structure every other screen
 * in epic 13 plugs into. Pure scaffolding — `ChatScreen` moves behind the
 * "Chat" destination unchanged in behavior; the other three destinations
 * are real, reachable, empty screens (mirroring `apps/mobile/src/App.tsx`'s
 * own Connectors screen shipping empty until a later task fills it in —
 * "its empty state states the product's central claim, which is true
 * today," not a broken link).
 *
 * No routing-library dependency: four flat, non-nested destinations with
 * no deep-linking requirement don't need one yet — component-level state
 * is the same "don't add a dependency the task doesn't need" call task
 * 12.6 made about a styling library.
 */

// 'connectors-setup' is deliberately not in `DESTINATIONS`/the sidebar —
// task 13.6's Search setup screen is reachable only via
// `ConnectorsScreen`'s own "Not set up"/"Change provider or key" rows
// calling this same `setDestination`, mirroring how `ChatScreen`'s own
// out-links already work rather than adding a nested-navigation system
// for one screen.
type Destination =
  'chat' | 'models' | 'connectors' | 'connectors-setup' | 'settings';

const DESTINATIONS: { id: Destination; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'models', label: 'Models' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'settings', label: 'Settings' },
];

export function AppShell() {
  const theme = useTheme();
  const [destination, setDestination] = useState<Destination>('chat');

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: theme.colors.surface,
        color: theme.colors.textPrimary,
        fontFamily: theme.fontFamily.body,
      }}
    >
      <nav
        aria-label="Main"
        style={{
          width: 180,
          flexShrink: 0,
          background: theme.colors.surfaceSunken,
          borderRight: `1px solid ${theme.colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.space[1],
          padding: theme.space[3],
        }}
      >
        {DESTINATIONS.map((d) => {
          const active = d.id === destination;
          return (
            <button
              key={d.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setDestination(d.id)}
              style={{
                textAlign: 'left',
                border: 'none',
                borderRadius: theme.radius.md,
                padding: `${theme.space[2]}px ${theme.space[3]}px`,
                fontSize: theme.fontSize.md,
                fontFamily: theme.fontFamily.body,
                cursor: 'pointer',
                background: active ? theme.colors.accentSubtle : 'transparent',
                color: active ? theme.colors.accent : theme.colors.textPrimary,
                fontWeight: active
                  ? theme.fontWeight.semibold
                  : theme.fontWeight.regular,
              }}
            >
              {d.label}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>
        {destination === 'chat' ? (
          <ChatScreen onNavigate={setDestination} />
        ) : null}
        {destination === 'models' ? <ModelsScreen /> : null}
        {destination === 'connectors' ? (
          <ConnectorsScreen onNavigate={setDestination} />
        ) : null}
        {destination === 'connectors-setup' ? (
          <SearchSetupScreen onNavigate={setDestination} />
        ) : null}
        {destination === 'settings' ? (
          <SettingsScreen onNavigate={setDestination} />
        ) : null}
      </div>
    </div>
  );
}
