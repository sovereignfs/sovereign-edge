import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  connectorScope,
  ensureCalendarAccess,
  ensureCameraAccess,
  grant,
  grantFor,
  needsRedecision,
  revoke,
  type ConnectorManifest,
  type GrantState,
} from '@/connectors';
import {
  CALENDAR_CONNECTOR_IDS,
  CALENDAR_MANIFESTS,
} from '@/connectors/calendar/manifest';
import {
  DEVICE_MANIFESTS,
  DEVICE_SET_TORCH_MANIFEST,
} from '@/connectors/device/manifest';
import { readSearchConfig } from '@/connectors/search/config';
import {
  TAVILY_MANIFEST,
  buildSearxngManifest,
} from '@/connectors/search/manifest';
import {
  readInstalledConnectors,
  removeInstalledConnector,
} from '@/connectors/store/installed';
import { ListItem, useTheme } from '@/design-system';

import type { SettingsStackParamList } from '../navigation/RootNavigator';

/**
 * Connector permissions (task 2.2), plus the Search connector's own
 * grant/revoke row (task 3.1) and any store-installed connectors (task 5.5).
 *
 * There is deliberately no master switch: research 0001 requires permission
 * to be per-connector, and a single "allow network" toggle is exactly the
 * blanket grant this product exists to avoid.
 *
 * Search has no built-in configuration — a fresh install has nothing to
 * grant until the user picks a provider in `SearchSetupScreen`. Reading
 * `readSearchConfig()` at render time (rather than a static list) is what
 * makes "configure once, then it behaves like any other connector row" true
 * without a second data path for Search specifically. Store-installed
 * connectors are read the same way, from `readInstalledConnectors()`.
 */

function stateLabel(state: GrantState, redecide: boolean): string {
  if (redecide) return 'NEEDS REVIEW';
  switch (state) {
    case 'granted':
      return 'ALLOWED';
    case 'denied':
      return 'BLOCKED';
    case 'not-asked':
      return 'NOT ASKED';
  }
}

export function ConnectorsScreen() {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  // Shared by Calendar and Torch — both need a real OS permission before
  // the app's own `grant()` runs, and never at the same time, so one piece
  // of state for "the OS refused" is simpler than one per connector.
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // `readSearchConfig()` below only runs when this component re-renders.
  // React Navigation keeps a stack screen mounted and does not re-render it
  // just because it regained focus, so without this, returning from
  // `SearchSetupScreen` after saving showed stale "not set up" state — the
  // save had worked, this screen just never looked again. Found on a real
  // device, not in a mocked test: the earlier reachability test only
  // asserted the screen could be navigated to, not that it stayed correct
  // after a round trip through setup.
  useFocusEffect(refresh);

  const searchConfig = readSearchConfig();
  const searchManifest: ConnectorManifest | null = searchConfig
    ? searchConfig.provider === 'searxng'
      ? buildSearxngManifest(searchConfig.searxngUrl)
      : TAVILY_MANIFEST
    : null;
  const storeConnectors = readInstalledConnectors();

  const empty = searchManifest === null && storeConnectors.length === 0;

  const renderRow = (manifest: ConnectorManifest) => {
    const state = grantFor(manifest.id).state;
    const redecide = needsRedecision(manifest);
    const allowed = state === 'granted' && !redecide;

    return (
      <ListItem
        key={manifest.id}
        title={manifest.name}
        // The scope is the substance of the grant. Naming it here means
        // the decision is made against what it actually permits, rather
        // than against the connector's description of itself.
        subtitle={`${connectorScope(manifest).join(', ')} · ${
          allowed ? 'tap to revoke' : 'tap to allow'
        }`}
        accessory={
          <Text
            style={{
              color: redecide
                ? theme.colors.warningText
                : allowed
                  ? theme.colors.successText
                  : theme.colors.textMuted,
              fontSize: theme.fontSize.label,
              fontFamily: theme.fontFamily.mono,
            }}
          >
            {stateLabel(state, redecide)}
          </Text>
        }
        onPress={() => {
          if (allowed) {
            void revoke(manifest).then(refresh);
            return;
          }
          // Calendar connectors need a real OS permission before the app's
          // own `grant()` is allowed to record "granted" — see
          // `permissions/calendarAccess.ts`'s own doc comment for why this
          // is asked once, not once per calendar row, and why it must run
          // before, not after, `grant()`.
          if (CALENDAR_CONNECTOR_IDS.includes(manifest.id)) {
            void ensureCalendarAccess().then(({ granted }) => {
              if (granted) {
                setPermissionError(null);
                grant(manifest);
              } else {
                setPermissionError(
                  'Calendar access was not allowed. Check this device’s system settings to allow it.',
                );
              }
              refresh();
            });
            return;
          }
          // Torch needs a real OS camera permission before the app's own
          // `grant()` is allowed to record "granted" — see
          // `permissions/cameraAccess.ts`'s own doc comment.
          if (manifest.id === DEVICE_SET_TORCH_MANIFEST.id) {
            void ensureCameraAccess().then(({ granted }) => {
              if (granted) {
                setPermissionError(null);
                grant(manifest);
              } else {
                setPermissionError(
                  'Camera access was not allowed. Check this device’s system settings to allow it.',
                );
              }
              refresh();
            });
            return;
          }
          grant(manifest);
          refresh();
        }}
      />
    );
  };

  return (
    <ScrollView style={{ backgroundColor: theme.colors.surface }}>
      <View style={{ padding: theme.space[4], gap: theme.space[2] }}>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.sm,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {empty
            ? 'No connectors are set up.'
            : 'Each connector is granted access separately.'}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {empty
            ? 'Nothing in this app can reach the network. Chat runs entirely on device. Set up Search below, or browse the Connector Store — either only acts once you configure and grant it access.'
            : 'Granting one connector never grants another. Revoking a connector also deletes any credential you gave it.'}
        </Text>
        {permissionError ? (
          <Text
            style={{
              color: theme.colors.warningText,
              fontSize: theme.fontSize.caption,
              fontFamily: theme.fontFamily.body,
            }}
          >
            {permissionError}
          </Text>
        ) : null}
      </View>

      {searchManifest === null ? (
        <ListItem
          title="Search"
          subtitle="Not set up — tap to choose a provider"
          onPress={() => navigation.navigate('SearchSetup')}
        />
      ) : (
        <>
          {renderRow(searchManifest)}
          {/* A way back into setup once configured — found missing when a
              real user needed to fix a mistyped key and had nowhere to go
              but revoke-then-grant, which re-offers the same (wrong)
              stored credential rather than letting them enter a new one. */}
          <ListItem
            title="Change provider or key"
            subtitle="Reconfigure Search"
            onPress={() => navigation.navigate('SearchSetup')}
          />
        </>
      )}

      {/* Calendar (task 10.1) is always offered, like Search — it needs no
          setup, only a grant. Four rows, not one: each tool is its own
          connector (see `calendar/manifest.ts`'s own doc comment for why),
          so a user can allow querying without allowing deletion. */}
      {CALENDAR_MANIFESTS.map((manifest) => renderRow(manifest))}

      {/* Device (tasks 11.1/11.2) is also always offered. Brightness needs
          no OS permission at all, so its row uses the plain default grant
          path above. Torch needs real camera permission, handled by the
          `DEVICE_SET_TORCH_MANIFEST.id` branch above — same shape as
          Calendar's. */}
      {DEVICE_MANIFESTS.map((manifest) => renderRow(manifest))}

      {storeConnectors.map((manifest) => (
        <View key={manifest.id}>
          {renderRow(manifest)}
          <ListItem
            title="Remove"
            subtitle={`Uninstall ${manifest.name}`}
            destructive
            onPress={() => {
              void revoke(manifest).then(() => {
                removeInstalledConnector(manifest.id);
                refresh();
              });
            }}
          />
        </View>
      ))}

      <ListItem
        title="Connector Store"
        subtitle="Browse and install third-party connectors"
        onPress={() => navigation.navigate('ConnectorStore')}
      />
    </ScrollView>
  );
}
