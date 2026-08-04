import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  grant,
  openVault,
  validateManifest,
  type ConnectorManifest,
} from '@/connectors';
import {
  CONNECTOR_ID,
  TAVILY_MANIFEST,
  buildSearxngManifest,
} from '@/connectors/search/manifest';
import { writeSearchConfig } from '@/connectors/search/config';
import { Button, TextField, useTheme } from '@/design-system';

import type { SettingsStackParamList } from '../navigation/RootNavigator';

/**
 * First-time (and reconfigure) setup for the Search connector (task 3.1).
 *
 * One connector, two interchangeable backends — the model always sees the
 * same `web_search` tool regardless of which is active; only the user
 * chooses, here. Neither is a safe zero-config default: a public SearXNG
 * instance can silently disable JSON output, and Tavily needs a key from
 * every user, so this screen exists rather than the app guessing at either.
 */

type Provider = 'searxng' | 'tavily';

export function SearchSetupScreen() {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  const [provider, setProvider] = useState<Provider>('searxng');
  const [searxngUrl, setSearxngUrl] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);

    const manifest: ConnectorManifest =
      provider === 'searxng'
        ? buildSearxngManifest(searxngUrl.trim())
        : TAVILY_MANIFEST;

    const result = validateManifest(manifest);
    if (!result.valid) {
      setError(result.issues[0]?.message ?? 'That configuration is not valid.');
      return;
    }
    if (provider === 'tavily' && !tavilyKey.trim()) {
      setError('Enter your Tavily API key.');
      return;
    }

    setSaving(true);
    try {
      if (provider === 'tavily') {
        // The stored credential is the whole header value, not just the key
        // — see TAVILY_MANIFEST's own comment on why the manifest itself
        // cannot add the "Bearer " prefix.
        await openVault(CONNECTOR_ID).write(
          'apiKey',
          `Bearer ${tavilyKey.trim()}`,
        );
        writeSearchConfig({ provider: 'tavily' });
      } else {
        writeSearchConfig({
          provider: 'searxng',
          searxngUrl: searxngUrl.trim(),
        });
      }
      grant(result.manifest);
      navigation.goBack();
    } catch {
      setError('Could not save this. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.surface }}
      contentContainerStyle={{ padding: theme.space[4], gap: theme.space[4] }}
    >
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          fontFamily: theme.fontFamily.body,
        }}
      >
        Choose which service answers web-search requests. Only one is active at
        a time — switching later will ask you to grant access again, since it is
        a different destination on the network.
      </Text>

      <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
        <Button
          label="SearXNG"
          variant={provider === 'searxng' ? 'primary' : 'secondary'}
          onPress={() => {
            setProvider('searxng');
            setError(null);
          }}
        />
        <Button
          label="Tavily"
          variant={provider === 'tavily' ? 'primary' : 'secondary'}
          onPress={() => {
            setProvider('tavily');
            setError(null);
          }}
        />
      </View>

      {provider === 'searxng' ? (
        <TextField
          label="Instance URL"
          placeholder="https://your-instance.example.org"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={searxngUrl}
          onChangeText={setSearxngUrl}
          hint="Self-hosted, or one you trust. Must be https — this app never relaxes that, even for your own network."
          error={error ?? undefined}
        />
      ) : (
        <TextField
          label="Tavily API key"
          placeholder="tvly-..."
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={tavilyKey}
          onChangeText={setTavilyKey}
          hint="Stored in the device keychain, scoped to this connector only."
          error={error ?? undefined}
        />
      )}

      <Button
        label="Save & enable"
        onPress={() => void save()}
        loading={saving}
        fullWidth
      />
    </ScrollView>
  );
}
