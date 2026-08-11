import { useState } from 'react';
import { Icon, Mark, useTheme, type IconName } from 'desktop-ui';
import { ChatScreen } from '../chat/ChatScreen';
import { ModelsScreen } from '../models/ModelsScreen';
import { ConnectorsScreen } from '../connectors/ConnectorsScreen';
import { ConnectorStoreScreen } from '../connectors/ConnectorStoreScreen';
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

// 'connector-store' is deliberately not in `DESTINATIONS`/the sidebar —
// reachable only via `ConnectorsScreen`'s own "Connector Store" row calling
// this same `setDestination`, mirroring how `ChatScreen`'s own out-links
// already work rather than adding a nested-navigation system for what is
// still a flat, non-deep-linked destination (task 5.5's own precedent).
// Search's setup flow no longer has a destination of its own — task 15.4
// folded it into `ConnectorsScreen`'s own inline detail view, the same
// list/detail-toggle pattern `ConnectorStoreScreen.tsx` already used for
// its own install flow.
type Destination = 'chat' | 'models' | 'connectors' | 'connector-store' | 'settings';

// 'connectors' uses the app's own "one gate" mark rather than a generic
// Lucide glyph — reference.html's desktop sidebar mockup does the same,
// tying the connector concept back to the mark's own "crossed the
// boundary, with permission" motif instead of a generic plug/link icon.
const DESTINATIONS: { id: Destination; label: string; icon: IconName | 'mark' }[] = [
  { id: 'chat', label: 'Chat', icon: 'message-circle' },
  { id: 'models', label: 'Models', icon: 'cpu' },
  { id: 'connectors', label: 'Connectors', icon: 'mark' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
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
        {/* `titleBarStyle: "Overlay"` (tauri.conf.json) floats the native
            traffic lights over this sidebar's own top-left corner instead
            of a separate grey title bar strip, so the app's own background
            paints all the way to the top. This spacer keeps the first nav
            item clear of them (~28px is macOS's own traffic-light zone
            height across current OS versions) and, via
            `data-tauri-drag-region`, is what makes the window draggable
            from here now that there's no native title bar providing that
            for free. */}
        <div data-tauri-drag-region style={{ height: 28, flexShrink: 0 }} />
        {DESTINATIONS.map((d) => {
          const active = d.id === destination;
          return (
            <button
              key={d.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setDestination(d.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.space[2],
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
              {d.icon === 'mark' ? (
                <Mark size={16} />
              ) : (
                <Icon name={d.icon} size="sm" aria-hidden />
              )}
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
        {destination === 'connector-store' ? (
          <ConnectorStoreScreen onNavigate={setDestination} />
        ) : null}
        {destination === 'settings' ? (
          <SettingsScreen onNavigate={setDestination} />
        ) : null}
      </div>
    </div>
  );
}
