import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, View } from 'react-native';

import {
  Icon,
  ListItem,
  SectionLabel,
  SegmentedControl,
  useTheme,
  useThemePreference,
  type ThemePreference,
} from '@/design-system';
import { APP_NAME, APP_VERSION } from '@/shared/app-info';

import type { SettingsStackParamList } from '../navigation/RootNavigator';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function SettingsScreen() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  return (
    <ScrollView style={{ backgroundColor: theme.colors.surface }}>
      <SectionLabel>Appearance</SectionLabel>
      <View
        style={{
          paddingHorizontal: theme.space[4],
          paddingBottom: theme.space[4],
        }}
      >
        <SegmentedControl
          options={THEME_OPTIONS}
          value={preference}
          onChange={setPreference}
          accessibilityLabel="Appearance"
        />
      </View>

      <SectionLabel>Privacy</SectionLabel>
      <ListItem
        title="Connectors"
        subtitle="Nothing can reach the network"
        onPress={() => navigation.navigate('Connectors')}
        accessory={
          <Icon
            name="chevron-right"
            size="sm"
            color={theme.colors.textSubtle}
            aria-hidden
          />
        }
      />

      <SectionLabel>About</SectionLabel>
      <ListItem title="Version" subtitle={APP_VERSION} />
      <ListItem
        title="Offline by design"
        subtitle={`${APP_NAME} has no network code in its chat path.`}
      />

      {/*
        Dev-only (epic task 16.1). Both this row and the route it opens are
        `__DEV__`-gated, so a release build has no way in and no screen to
        reach — the entry point alone would be a hidden feature rather than
        an absent one.
      */}
      {__DEV__ && (
        <>
          <SectionLabel>Developer</SectionLabel>
          <ListItem
            title="Embedding Spike"
            subtitle="Measure an embedding model alongside a loaded chat model"
            onPress={() => navigation.navigate('EmbeddingSpike')}
            accessory={
              <Icon
                name="chevron-right"
                size="sm"
                color={theme.colors.textSubtle}
                aria-hidden
              />
            }
          />
        </>
      )}
    </ScrollView>
  );
}
