import { ScrollView, Text, View } from 'react-native';

import { ListItem, useTheme } from '@/design-system';

/**
 * Connector permissions.
 *
 * Empty by design: no connector exists yet (the Search connector is task 3.1),
 * and the permission model itself is task 2.2. The screen is here because
 * 8.1 calls for it and because the empty state is the honest one — a user
 * opening this today should see that nothing can reach the network, which is
 * true and is the product's central claim.
 */
export function ConnectorsScreen() {
  const theme = useTheme();

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
          No connectors are installed.
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
          }}
        >
          Nothing in this app can reach the network. Chat runs entirely on
          device. When a connector is added it will appear here, and it can only
          act after you grant it permission — each one separately.
        </Text>
      </View>

      <ListItem
        title="Network access"
        subtitle="No connector has been granted access"
      />
    </ScrollView>
  );
}
