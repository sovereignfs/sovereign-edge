import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  connectorScope,
  grantFor,
  needsRedecision,
  type ConnectorManifest,
  type GrantState,
} from '@/connectors';
import { CALENDAR_MANIFESTS } from '@/connectors/calendar/manifest';
import { DEVICE_MANIFESTS } from '@/connectors/device/manifest';
import { readSearchConfig } from '@/connectors/search/config';
import {
  TAVILY_MANIFEST,
  buildSearxngManifest,
} from '@/connectors/search/manifest';
import { readInstalledConnectors } from '@/connectors/store/installed';
import {
  FitBadge,
  Icon,
  ListItem,
  SectionLabel,
  useTheme,
  type FitBadgeVariant,
} from '@/design-system';

import type { SettingsStackParamList } from '../navigation/RootNavigator';

/**
 * Connector permissions (task 2.2), plus the Search connector's own entry
 * (task 3.1) and any store-installed connectors (task 5.5), grouped into
 * sections with a status pill per row (task 7.7) — every row here only
 * navigates to `ConnectorDetailScreen`, which owns the actual grant/revoke/
 * configure actions, rather than toggling state inline.
 *
 * There is deliberately no master switch: research 0001 requires permission
 * to be per-connector, and a single "allow network" toggle is exactly the
 * blanket grant this product exists to avoid.
 *
 * Search has no built-in configuration — a fresh install has nothing to
 * grant until the user picks a provider in the detail screen. Reading
 * `readSearchConfig()` at render time (rather than a static list) is what
 * makes "configure once, then it behaves like any other connector row" true
 * without a second data path for Search specifically. Store-installed
 * connectors are read the same way, from `readInstalledConnectors()`.
 */

function pillFor(
  state: GrantState,
  redecide: boolean,
): { label: string; variant: FitBadgeVariant } {
  if (redecide) return { label: 'Needs review', variant: 'tight' };
  switch (state) {
    case 'granted':
      return { label: 'Allowed', variant: 'good' };
    case 'denied':
      return { label: 'Blocked', variant: 'bad' };
    case 'not-asked':
      return { label: 'Not asked', variant: 'neutral' };
  }
}

export function ConnectorsScreen() {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // `readSearchConfig()` below only runs when this component re-renders.
  // React Navigation keeps a stack screen mounted and does not re-render it
  // just because it regained focus, so without this, returning from the
  // detail screen after saving showed stale "not set up" state — the save
  // had worked, this screen just never looked again. Found on a real
  // device, not in a mocked test.
  useFocusEffect(refresh);

  const searchConfig = readSearchConfig();
  const searchManifest: ConnectorManifest | null = searchConfig
    ? searchConfig.provider === 'searxng'
      ? buildSearxngManifest(searchConfig.searxngUrl)
      : TAVILY_MANIFEST
    : null;
  const storeConnectors = readInstalledConnectors();

  const empty = searchManifest === null && storeConnectors.length === 0;

  const chevron = (
    <Icon
      name="chevron-right"
      size="sm"
      color={theme.colors.textSubtle}
      aria-hidden
    />
  );

  const pillAndChevron = (manifest: ConnectorManifest) => {
    const { state } = grantFor(manifest.id);
    const pill = pillFor(state, needsRedecision(manifest));
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[2],
        }}
      >
        <FitBadge label={pill.label} variant={pill.variant} />
        {chevron}
      </View>
    );
  };

  const renderRow = (manifest: ConnectorManifest, installed = false) => (
    <ListItem
      key={manifest.id}
      title={manifest.name}
      accessory={pillAndChevron(manifest)}
      onPress={() =>
        navigation.navigate('ConnectorDetail', {
          kind: 'manifest',
          manifest,
          installed,
        })
      }
    />
  );

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
      </View>

      <SectionLabel>Search</SectionLabel>
      <ListItem
        title="Search"
        subtitle={
          searchManifest
            ? connectorScope(searchManifest).join(', ')
            : 'Choose a provider to get started'
        }
        accessory={
          searchManifest ? (
            pillAndChevron(searchManifest)
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space[2],
              }}
            >
              <FitBadge label="Not set up" variant="neutral" />
              {chevron}
            </View>
          )
        }
        onPress={() =>
          navigation.navigate('ConnectorDetail', { kind: 'search' })
        }
      />

      {/* Calendar (task 10.1) is always offered, like Search — it needs no
          setup, only a grant. Four rows, not one: each tool is its own
          connector (see `calendar/manifest.ts`'s own doc comment for why),
          so a user can allow querying without allowing deletion. */}
      <SectionLabel>Calendar</SectionLabel>
      {CALENDAR_MANIFESTS.map((manifest) => renderRow(manifest))}

      {/* Device (tasks 11.1/11.2) is also always offered. */}
      <SectionLabel>Device</SectionLabel>
      {DEVICE_MANIFESTS.map((manifest) => renderRow(manifest))}

      {storeConnectors.length > 0 && (
        <>
          <SectionLabel>Installed</SectionLabel>
          {storeConnectors.map((manifest) => renderRow(manifest, true))}
        </>
      )}
      {/* Its own row, not grouped under "Installed" — the Store is where
          you go to install something, not something already installed. */}
      <ListItem
        title="Connector Store"
        subtitle="Browse and install third-party connectors"
        accessory={chevron}
        onPress={() => navigation.navigate('ConnectorStore')}
      />
    </ScrollView>
  );
}
