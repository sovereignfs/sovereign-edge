import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ChatScreen } from '@/chat/screens/ChatScreen';
import type { ConnectorManifest } from '@/connectors';
import { Icon, useTheme, type Theme } from '@/design-system';
import { ModelsScreen } from '@/models/screens/ModelsScreen';

import { ConnectorDetailScreen } from '../screens/ConnectorDetailScreen';
import { ConnectorInstallScreen } from '../screens/ConnectorInstallScreen';
import { ConnectorStoreScreen } from '../screens/ConnectorStoreScreen';
import { ConnectorsScreen } from '../screens/ConnectorsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Connectors: undefined;
  // Search has no manifest until configured, so it navigates by kind alone;
  // every other connector already has one (built-in, or read back from the
  // installed store), so it travels with the row that opened it rather than
  // being looked up again by id on the far side.
  ConnectorDetail:
    | { kind: 'search' }
    | { kind: 'manifest'; manifest: ConnectorManifest; installed?: boolean };
  ConnectorStore: undefined;
  ConnectorInstall: {
    manifest: ConnectorManifest;
    submittedBy: { name: string; contact?: string };
  };
};

export type RootTabParamList = {
  Chat: undefined;
  Models: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

/**
 * React Navigation keeps its own theme for the chrome it draws (headers, tab
 * bar, the screen background behind a transition). Left alone it uses its
 * defaults, which would leave a light tab bar under a dark app — so the app
 * theme is mapped onto it rather than maintained twice.
 */
function navigationTheme(theme: Theme): NavTheme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.accent,
      background: theme.colors.surface,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.errorSolid,
    },
  };
}

function SettingsNavigator() {
  const theme = useTheme();
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { color: theme.colors.textPrimary },
        headerTintColor: theme.colors.accent,
      }}
    >
      <SettingsStack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <SettingsStack.Screen
        name="Connectors"
        component={ConnectorsScreen}
        options={{ title: 'Connectors' }}
      />
      <SettingsStack.Screen
        name="ConnectorDetail"
        component={ConnectorDetailScreen}
        options={({ route }) => ({
          // Native-stack computes header config for every registered screen
          // up front (to support the iOS swipe-back preview), not only once
          // visited — `route.params` is undefined at that point, before this
          // screen has ever been navigated to with real params.
          title: !route.params
            ? 'Connector'
            : route.params.kind === 'search'
              ? 'Search'
              : route.params.manifest.name,
        })}
      />
      <SettingsStack.Screen
        name="ConnectorStore"
        component={ConnectorStoreScreen}
        options={{ title: 'Connector Store' }}
      />
      <SettingsStack.Screen
        name="ConnectorInstall"
        component={ConnectorInstallScreen}
        options={{ title: 'Install Connector' }}
      />
    </SettingsStack.Navigator>
  );
}

export function RootNavigator() {
  const theme = useTheme();

  return (
    <NavigationContainer theme={navigationTheme(theme)}>
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTitleStyle: { color: theme.colors.textPrimary },
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          },
          tabBarActiveTintColor: theme.colors.textPrimary,
          tabBarInactiveTintColor: theme.colors.textSubtle,
          tabBarLabelStyle: {
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
          },
        }}
      >
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            tabBarAccessibilityLabel: 'Chat tab',
            tabBarIcon: ({ color }) => (
              <Icon name="message-circle" color={color} aria-hidden />
            ),
          }}
        />
        <Tab.Screen
          name="Models"
          component={ModelsScreen}
          options={{
            tabBarAccessibilityLabel: 'Models tab',
            // The chip glyph, not a generic package/box icon — the same
            // "inference on your own silicon" shorthand the app's own mark
            // uses (task 7.4).
            tabBarIcon: ({ color }) => (
              <Icon name="cpu" color={color} aria-hidden />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsNavigator}
          options={{
            headerShown: false,
            tabBarAccessibilityLabel: 'Settings tab',
            tabBarIcon: ({ color }) => (
              <Icon name="settings" color={color} aria-hidden />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
