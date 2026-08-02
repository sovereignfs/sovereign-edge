import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  grant,
  grantFor,
  listGrants,
  needsRedecision,
  revoke,
  type ConnectorManifest,
  type GrantState,
} from '@/connectors';
import { ListItem, useTheme } from '@/design-system';

/**
 * Connector permissions (task 2.2).
 *
 * The settings surface for every connector and its current state. There is
 * deliberately no master switch: research 0001 requires permission to be
 * per-connector, and a single "allow network" toggle is exactly the blanket
 * grant this product exists to avoid.
 *
 * No connector ships yet — the Search connector is task 3.1 — so in practice
 * this renders its empty state today. It is built against the real permission
 * store rather than a placeholder, so installing the first connector is the
 * only change needed.
 */

/** Installed connectors. Empty until task 3.1 ships the Search connector. */
const INSTALLED: ConnectorManifest[] = [];

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
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const decided = listGrants();
  const empty = INSTALLED.length === 0;

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
            ? 'No connectors are installed.'
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
            ? 'Nothing in this app can reach the network. Chat runs entirely on device. When a connector is added it will appear here, and it can only act after you grant it permission — each one separately.'
            : 'Granting one connector never grants another. Revoking a connector also deletes any credential you gave it.'}
        </Text>
      </View>

      {empty ? (
        <ListItem
          title="Network access"
          subtitle={
            decided.length === 0
              ? 'No connector has been granted access'
              : `${decided.filter((g) => g.state === 'granted').length} of ${decided.length} previously decided connectors allowed`
          }
        />
      ) : (
        INSTALLED.map((manifest) => {
          const state = grantFor(manifest.id).state;
          const redecide = needsRedecision(manifest);
          const allowed = state === 'granted' && !redecide;

          return (
            <ListItem
              key={manifest.id}
              title={manifest.name}
              // The origins are the substance of the grant. Naming them here
              // means the decision is made against what it actually permits,
              // rather than against the connector's description of itself.
              subtitle={`${manifest.permissions.network.origins.join(', ')} · ${
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
                } else {
                  grant(manifest);
                  refresh();
                }
              }}
            />
          );
        })
      )}
    </ScrollView>
  );
}
