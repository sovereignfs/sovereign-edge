import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ChatScreen } from '@/chat/screens/ChatScreen';
import { useTheme, type Theme } from '@/design-system';
import { ModelsScreen } from '@/models/screens/ModelsScreen';

import { ConnectorsScreen } from '../screens/ConnectorsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Connectors: undefined;
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
          // No icon set is chosen yet, so tabs are text-only. The label must
          // live in the label slot: putting it in tabBarIcon squeezes it into
          // the narrow glyph box and the words wrap mid-syllable on device.
          tabBarLabelStyle: {
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
          },
          // Explicitly no icon. Omitting `tabBarIcon` entirely makes
          // bottom-tabs draw its own placeholder, which renders as a
          // missing-glyph box above every label.
          tabBarIcon: () => null,
        }}
      >
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            tabBarAccessibilityLabel: 'Chat tab',
          }}
        />
        <Tab.Screen
          name="Models"
          component={ModelsScreen}
          options={{
            tabBarAccessibilityLabel: 'Models tab',
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsNavigator}
          options={{
            headerShown: false,
            tabBarAccessibilityLabel: 'Settings tab',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
