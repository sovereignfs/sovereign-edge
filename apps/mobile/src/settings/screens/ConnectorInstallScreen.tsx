import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  grant,
  isConnectorUsable,
  openVault,
  validateManifest,
  type ConnectorManifestTier1,
} from '@/connectors';
import { saveInstalledConnector } from '@/connectors/store/installed';
import { Button, TextField, useTheme } from '@/design-system';

import type { SettingsStackParamList } from '../navigation/RootNavigator';

/**
 * Installs one connector from the store (task 5.5).
 *
 * "Install" here means exactly what `SearchSetupScreen` already does for
 * the first-party Search connector — validate, write any declared
 * credentials to the vault, then `grant()` — epic 2.2's consent model,
 * reused completely unchanged, per this task's own review checklist. The
 * only thing new is where the manifest came from (the registry, not a
 * hand-built one) and that it has to be persisted itself, via
 * `saveInstalledConnector`, since there is no config this app can rebuild
 * it from later the way Search's manifest is rebuilt from its own config.
 */
export function ConnectorInstallScreen() {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const route =
    useRoute<RouteProp<SettingsStackParamList, 'ConnectorInstall'>>();
  const { manifest, submittedBy } = route.params;

  const credentialDefs =
    manifest.tier === 1
      ? ((manifest as ConnectorManifestTier1).permissions.credentials ?? [])
      : [];

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const install = async () => {
    setError(null);

    const result = validateManifest(manifest);
    if (!result.valid) {
      setError(
        result.issues[0]?.message ?? 'This connector is not a valid manifest.',
      );
      return;
    }

    // Defense in depth (task 6.1): the store screen already disables the
    // tap-through to this screen for a paid entry, but this function must
    // not assume its caller did — the same posture `executeConnectorCall`
    // takes for `isAllowed`.
    if (!isConnectorUsable(result.manifest)) {
      setError('This connector is not yet supported.');
      return;
    }

    for (const cred of credentialDefs) {
      if (!values[cred.key]?.trim()) {
        setError(`Enter ${cred.label}.`);
        return;
      }
    }

    setInstalling(true);
    try {
      for (const cred of credentialDefs) {
        await openVault(result.manifest.id).write(
          cred.key,
          values[cred.key]!.trim(),
        );
      }
      grant(result.manifest);
      saveInstalledConnector(result.manifest);
      // Pops back to the already-mounted Connectors screen rather than one
      // step to the store list, so the user lands where the new connector
      // is now visible, not back where they just were.
      navigation.navigate('Connectors');
    } catch {
      setError('Could not install this connector. Try again.');
    } finally {
      setInstalling(false);
    }
  };

  const scope =
    manifest.tier === 1
      ? manifest.permissions.network.origins
      : manifest.permissions.device.capabilities;

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.surface }}
      contentContainerStyle={{ padding: theme.space[4], gap: theme.space[4] }}
    >
      <View style={{ gap: theme.space[1] }}>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.md,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {manifest.name}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {manifest.summary}
        </Text>
        <Text
          style={{
            color: theme.colors.textSubtle,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
          }}
        >
          Submitted by {submittedBy.name}
        </Text>
      </View>

      <View style={{ gap: theme.space[1] }}>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.sm,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {manifest.tier === 1 ? 'Reaches' : 'Uses device capabilities'}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.mono,
          }}
        >
          {scope.join(', ')}
        </Text>
      </View>

      {credentialDefs.map((cred) => (
        <TextField
          key={cred.key}
          label={cred.label}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={values[cred.key] ?? ''}
          onChangeText={(text) =>
            setValues((prev) => ({ ...prev, [cred.key]: text }))
          }
          hint="Stored in the device keychain, scoped to this connector only."
          error={error ?? undefined}
        />
      ))}

      {credentialDefs.length === 0 && error ? (
        <Text
          style={{
            color: theme.colors.errorText,
            fontSize: theme.fontSize.sm,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {error}
        </Text>
      ) : null}

      <Button
        label="Install & grant"
        onPress={() => void install()}
        loading={installing}
        fullWidth
      />
    </ScrollView>
  );
}
