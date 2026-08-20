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
type Destination =
  'chat' | 'models' | 'connectors' | 'connector-store' | 'settings';

// 'connectors' uses the app's own "one gate" mark rather than a generic
// Lucide glyph — reference.html's desktop sidebar mockup does the same,
// tying the connector concept back to the mark's own "crossed the
// boundary, with permission" motif instead of a generic plug/link icon.
const DESTINATIONS: {
  id: Destination;
  label: string;
  icon: IconName | 'mark';
}[] = [
  { id: 'chat', label: 'Chat', icon: 'message-circle' },
  { id: 'models', label: 'Models', icon: 'cpu' },
  { id: 'connectors', label: 'Connectors', icon: 'mark' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

// macOS's own traffic-light cluster + its standard left inset — the same
// zone `titleBarStyle: "Overlay"` floats those buttons over. The toggle
// sits just to the right of it rather than under it, so it's never
// obscured by (or fights a click with) the native buttons.
const TRAFFIC_LIGHT_INSET = 78;
const TITLEBAR_HEIGHT = 36;
const SIDEBAR_WIDTH = 180;

export function AppShell() {
  const theme = useTheme();
  const [destination, setDestination] = useState<Destination>('chat');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: theme.colors.surface,
        color: theme.colors.textPrimary,
        fontFamily: theme.fontFamily.body,
      }}
    >
      {/* A titlebar strip spanning the full window width, independent of
          the sidebar's own collapsed state — this is what keeps the
          toggle button anchored in the same spot next to the traffic
          lights whether the sidebar is open or closed, and what keeps the
          window draggable from up here either way (previously the
          sidebar's own `data-tauri-drag-region` spacer, which would have
          disappeared along with the sidebar on collapse). */}
      <div
        data-tauri-drag-region
        style={{
          height: TITLEBAR_HEIGHT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{ width: TRAFFIC_LIGHT_INSET, flexShrink: 0 }} />
        <button
          type="button"
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-pressed={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            border: 'none',
            borderRadius: theme.radius.md,
            background: 'transparent',
            color: theme.colors.textMuted,
            cursor: 'pointer',
          }}
        >
          <Icon name="panel-left" size="sm" aria-hidden />
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <nav
          aria-label="Main"
          aria-hidden={sidebarCollapsed}
          style={{
            width: sidebarCollapsed ? 0 : SIDEBAR_WIDTH,
            flexShrink: 0,
            overflow: 'hidden',
            background: theme.colors.surfaceSunken,
            borderRight: sidebarCollapsed
              ? 'none'
              : `1px solid ${theme.colors.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: theme.space[1],
            padding: sidebarCollapsed ? 0 : theme.space[3],
            transition: `width ${theme.motion.durationFast}ms cubic-bezier(${theme.motion.easeOut.join(',')}), padding ${theme.motion.durationFast}ms cubic-bezier(${theme.motion.easeOut.join(',')})`,
          }}
        >
          {DESTINATIONS.map((d) => {
            const active = d.id === destination;
            return (
              <button
                key={d.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                tabIndex={sidebarCollapsed ? -1 : undefined}
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
                  whiteSpace: 'nowrap',
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
    </div>
  );
}
