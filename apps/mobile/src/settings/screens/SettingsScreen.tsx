import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, Text, View } from 'react-native';

import {
  ListItem,
  Toggle,
  useTheme,
  useThemePreference,
  type ThemePreference,
} from '@/design-system';
import { APP_NAME, APP_VERSION } from '@/shared/app-info';

import type { SettingsStackParamList } from '../navigation/RootNavigator';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

const LABEL: Record<ThemePreference, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
};

export function SettingsScreen() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  return (
    <ScrollView style={{ backgroundColor: theme.colors.surface }}>
      <SectionLabel>Appearance</SectionLabel>
      {ORDER.map((option) => (
        <ListItem
          key={option}
          title={LABEL[option]}
          onPress={() => setPreference(option)}
          accessory={
            // A checkmark would be lighter, but reusing Toggle keeps the
            // selected state legible to a screen reader without inventing a
            // radio control that does not exist in the component set yet.
            <Toggle
              value={preference === option}
              onValueChange={() => setPreference(option)}
              accessibilityLabel={LABEL[option]}
            />
          }
        />
      ))}

      <SectionLabel>Privacy</SectionLabel>
      <ListItem
        title="Connectors"
        subtitle="Nothing can reach the network"
        onPress={() => navigation.navigate('Connectors')}
      />

      <SectionLabel>About</SectionLabel>
      <ListItem title="Version" subtitle={APP_VERSION} />
      <ListItem
        title="Offline by design"
        subtitle={`${APP_NAME} has no network code in its chat path.`}
      />
    </ScrollView>
  );
}

function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: theme.space[4],
        paddingTop: theme.space[5],
        paddingBottom: theme.space[2],
      }}
    >
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.label,
          fontFamily: theme.fontFamily.body,
          letterSpacing: 1,
        }}
      >
        {children.toUpperCase()}
      </Text>
    </View>
  );
}
