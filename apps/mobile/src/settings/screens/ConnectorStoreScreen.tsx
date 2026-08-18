import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';

import type { ConnectorManifest } from '@/connectors';
import {
  fetchConnectorRegistry,
  type RegistryConnector,
} from '@/connectors/store/registry';
import { readInstalledConnectors } from '@/connectors/store/installed';
import { Icon, ListItem, TextField, useTheme } from '@/design-system';

import type { SettingsStackParamList } from '../navigation/RootNavigator';

/**
 * Browse the public connector registry (task 5.4) and install one (task
 * 5.5).
 *
 * This is the first screen in the app that needs the internet for its own
 * sake, not a granted connector's — said plainly below rather than fetching
 * silently, since every other screen in this app works fully offline.
 */

const CURRENT_PLATFORM: 'ios' | 'android' =
  Platform.OS === 'ios' ? 'ios' : 'android';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; connectors: RegistryConnector[] };

export function ConnectorStoreScreen() {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

  // Re-read on every focus, not just on mount: React Navigation keeps this
  // screen mounted on the stack under `ConnectorInstall`/`ConnectorDetail`,
  // so it never re-renders on its own just from regaining focus (the same
  // reason `ConnectorsScreen` needs this). Without it, installing a
  // connector and coming back here left this screen still routing that
  // same row to the raw install form — the install had genuinely worked,
  // this screen just never looked again.
  useFocusEffect(
    useCallback(() => {
      setInstalledIds(
        new Set(readInstalledConnectors().map((m) => m.id)),
      );
    }, []),
  );

  useEffect(() => {
    let cancelled = false;
    // No synchronous setState here: the initial `useState` value above is
    // already `{ kind: 'loading' }`, so there's nothing to synchronize on
    // mount — only the fetch's eventual result needs to reach state.
    void fetchConnectorRegistry().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState({ kind: 'loaded', connectors: result.connectors });
      } else {
        setState({
          kind: 'error',
          message:
            result.error.kind === 'network'
              ? `Could not reach the registry (${result.error.detail}). Check your connection and try again.`
              : `The registry response was not understood (${result.error.detail}).`,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible =
    state.kind === 'loaded'
      ? state.connectors
          // Tier 3 dispatches to a handler already registered inside the
          // app — a third-party submission can declare it, but nothing in
          // the store could ever make it work, so it's excluded here
          // rather than shown and failing at install/execute time.
          .filter((c) => c.manifest.tier === 1)
          .filter((c) => c.manifest.platforms.includes(CURRENT_PLATFORM))
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
    <ScrollView style={{ backgroundColor: theme.colors.surface }}>
      <View style={{ padding: theme.space[4], gap: theme.space[3] }}>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
          }}
        >
          This screen fetches the public connector registry from the internet —
          the one place in this app that reaches the network for its own sake,
          not a connector you have already granted. Nothing is installed or
          granted until you choose one and confirm.
        </Text>
        {state.kind === 'loaded' && state.connectors.length > 0 ? (
          <TextField
            label="Search"
            placeholder="Filter by name or description"
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
          />
        ) : null}
      </View>

      {state.kind === 'loading' ? (
        <View style={{ padding: theme.space[4] }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.sm,
              fontFamily: theme.fontFamily.body,
            }}
          >
            Loading the connector registry…
          </Text>
        </View>
      ) : null}

      {state.kind === 'error' ? (
        <View style={{ padding: theme.space[4] }}>
          <Text
            style={{
              color: theme.colors.errorText,
              fontSize: theme.fontSize.sm,
              fontFamily: theme.fontFamily.body,
            }}
          >
            {state.message}
          </Text>
        </View>
      ) : null}

      {state.kind === 'loaded' && visible.length === 0 ? (
        <View style={{ padding: theme.space[4] }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.sm,
              fontFamily: theme.fontFamily.body,
            }}
          >
            {state.connectors.length === 0
              ? 'The registry has no listings right now.'
              : 'No connectors match this search.'}
          </Text>
        </View>
      ) : null}

      {visible.map((entry) => {
        const paid = entry.manifest.pricing.model === 'paid';
        const installed = installedIds.has(entry.manifest.id);
        return (
          <ListItem
            key={entry.id}
            title={entry.manifest.name}
            subtitle={
              paid
                ? `${entry.manifest.summary} · not yet supported`
                : installed
                  ? `${entry.manifest.summary} · Installed`
                  : entry.manifest.summary
            }
            disabled={paid}
            accessory={
              paid ? undefined : (
                <Icon
                  name="chevron-right"
                  size="sm"
                  color={theme.colors.textSubtle}
                  aria-hidden
                />
              )
            }
            onPress={
              paid
                ? undefined
                : () =>
                    // Already installed: this row's tap target opens the
                    // connector's existing detail/grant screen — the same
                    // place a fresh install lands on — rather than the raw
                    // install form, which used to reappear (with its own
                    // "Install & grant" button, no memory of the earlier
                    // install) every time this screen regained focus.
                    installed
                      ? navigation.navigate('ConnectorDetail', {
                          kind: 'manifest',
                          manifest: entry.manifest as ConnectorManifest,
                          installed: true,
                        })
                      : navigation.navigate('ConnectorInstall', {
                          manifest: entry.manifest as ConnectorManifest,
                          submittedBy: entry.submittedBy,
                        })
            }
          />
        );
      })}
    </ScrollView>
  );
}
