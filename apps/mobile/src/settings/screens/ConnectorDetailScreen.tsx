import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  connectorScope,
  ensureCalendarAccess,
  ensureCameraAccess,
  grant,
  grantFor,
  needsRedecision,
  openVault,
  revoke,
  validateManifest,
  type ConnectorManifest,
  type GrantState,
} from '@/connectors';
import { CALENDAR_CONNECTOR_IDS } from '@/connectors/calendar/manifest';
import { DEVICE_SET_TORCH_MANIFEST } from '@/connectors/device/manifest';
import {
  readSearchConfig,
  writeSearchConfig,
} from '@/connectors/search/config';
import {
  CONNECTOR_ID as SEARCH_CONNECTOR_ID,
  TAVILY_MANIFEST,
  buildSearxngManifest,
} from '@/connectors/search/manifest';
import { removeInstalledConnector } from '@/connectors/store/installed';
import {
  Button,
  FitBadge,
  SectionLabel,
  SegmentedControl,
  TextField,
  useTheme,
  type FitBadgeVariant,
} from '@/design-system';

import type { SettingsStackParamList } from '../navigation/RootNavigator';

/**
 * A single connector's grant state, scope, and (for Search) provider —
 * folding `SearchSetupScreen`'s first-run flow in as one more state this
 * screen already has to render, rather than a separate screen with its own
 * navigation entry (task 7.7).
 *
 * Deliberately stays on this screen after granting/revoking/saving instead
 * of navigating back — the pill and the available action update in place,
 * which is what a *detail* screen showing "grant state, scope, provider
 * switch, credential field, revoke" all at once should do, rather than
 * bouncing the user back to the list to see the result of their own tap.
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

export function ConnectorDetailScreen() {
  const route =
    useRoute<RouteProp<SettingsStackParamList, 'ConnectorDetail'>>();
  return route.params.kind === 'search' ? (
    <SearchDetail />
  ) : (
    <ManifestDetail
      manifest={route.params.manifest}
      installed={route.params.installed ?? false}
    />
  );
}

function Header({
  title,
  subtitle,
  pill,
}: {
  title: string;
  subtitle: string;
  pill: { label: string; variant: FitBadgeVariant };
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: theme.space[4],
        gap: theme.space[3],
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.md,
            fontWeight: theme.fontWeight.semibold,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {subtitle}
        </Text>
      </View>
      <FitBadge label={pill.label} variant={pill.variant} />
    </View>
  );
}

function ScopeSection({
  label,
  scope,
}: {
  label: string;
  scope: string[];
}) {
  const theme = useTheme();
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.caption,
          fontFamily: theme.fontFamily.mono,
          paddingHorizontal: theme.space[4],
          paddingBottom: theme.space[3],
        }}
      >
        {scope.join(', ')}
      </Text>
    </>
  );
}

function ErrorNotice({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.warningText,
        fontSize: theme.fontSize.caption,
        fontFamily: theme.fontFamily.body,
        paddingHorizontal: theme.space[4],
        paddingBottom: theme.space[2],
      }}
    >
      {message}
    </Text>
  );
}

/** Calendar and Torch need a real OS permission before `grant()` may record
 * "granted" — see `permissions/calendarAccess.ts`/`cameraAccess.ts`'s own
 * doc comments for why this is asked here, before, not after, `grant()`. */
function grantWithAnyOsGate(
  manifest: ConnectorManifest,
  onDone: (permissionError: string | null) => void,
): void {
  if (CALENDAR_CONNECTOR_IDS.includes(manifest.id)) {
    void ensureCalendarAccess().then(({ granted: osGranted }) => {
      if (osGranted) {
        grant(manifest);
        onDone(null);
      } else {
        onDone(
          'Calendar access was not allowed. Check this device’s system settings to allow it.',
        );
      }
    });
    return;
  }
  if (manifest.id === DEVICE_SET_TORCH_MANIFEST.id) {
    void ensureCameraAccess().then(({ granted: osGranted }) => {
      if (osGranted) {
        grant(manifest);
        onDone(null);
      } else {
        onDone(
          'Camera access was not allowed. Check this device’s system settings to allow it.',
        );
      }
    });
    return;
  }
  grant(manifest);
  onDone(null);
}

function ManifestDetail({
  manifest,
  installed,
}: {
  manifest: ConnectorManifest;
  installed: boolean;
}) {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const grantState = grantFor(manifest.id);
  const redecide = needsRedecision(manifest);
  const allowed = grantState.state === 'granted' && !redecide;
  const scope = connectorScope(manifest);

  return (
    <ScrollView style={{ backgroundColor: theme.colors.surface }}>
      <Header
        title={manifest.name}
        subtitle={manifest.summary}
        pill={pillFor(grantState.state, redecide)}
      />
      {permissionError ? <ErrorNotice message={permissionError} /> : null}
      <ScopeSection
        label={manifest.tier === 1 ? 'Reaches' : 'Uses'}
        scope={scope}
      />

      <View style={{ padding: theme.space[4], gap: theme.space[2] }}>
        {allowed ? (
          <Button
            label="Revoke access"
            variant="danger"
            onPress={() => void revoke(manifest).then(refresh)}
            fullWidth
          />
        ) : (
          <Button
            label="Grant access"
            onPress={() =>
              grantWithAnyOsGate(manifest, (error) => {
                setPermissionError(error);
                refresh();
              })
            }
            fullWidth
          />
        )}
        {installed ? (
          <Button
            label="Remove connector"
            variant="danger"
            onPress={() =>
              void revoke(manifest).then(() => {
                removeInstalledConnector(manifest.id);
                navigation.navigate('Connectors');
              })
            }
            fullWidth
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

type Provider = 'searxng' | 'tavily';

function SearchDetail() {
  const theme = useTheme();
  const config = readSearchConfig();

  const [provider, setProvider] = useState<Provider>(
    config?.provider ?? 'searxng',
  );
  const [searxngUrl, setSearxngUrl] = useState(
    config?.provider === 'searxng' ? config.searxngUrl : '',
  );
  const [tavilyKey, setTavilyKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const manifest: ConnectorManifest | null = config
    ? config.provider === 'searxng'
      ? buildSearxngManifest(config.searxngUrl)
      : TAVILY_MANIFEST
    : null;
  const grantState = manifest ? grantFor(manifest.id) : null;
  const redecide = manifest ? needsRedecision(manifest) : false;
  const allowed =
    manifest !== null && grantState?.state === 'granted' && !redecide;
  const pill =
    manifest && grantState
      ? pillFor(grantState.state, redecide)
      : { label: 'Not set up', variant: 'neutral' as const };

  const save = async () => {
    setError(null);

    const candidate: ConnectorManifest =
      provider === 'searxng'
        ? buildSearxngManifest(searxngUrl.trim())
        : TAVILY_MANIFEST;

    const result = validateManifest(candidate);
    if (!result.valid) {
      setError(result.issues[0]?.message ?? 'That configuration is not valid.');
      return;
    }
    // A first-time Tavily setup needs a key; reconfiguring may leave the
    // field blank to keep the one already stored.
    if (provider === 'tavily' && !tavilyKey.trim() && !config) {
      setError('Enter your Tavily API key.');
      return;
    }

    setSaving(true);
    try {
      if (provider === 'tavily') {
        if (tavilyKey.trim()) {
          // The stored credential is the whole header value, not just the
          // key — see TAVILY_MANIFEST's own comment on why the manifest
          // itself cannot add the "Bearer " prefix.
          await openVault(SEARCH_CONNECTOR_ID).write(
            'apiKey',
            `Bearer ${tavilyKey.trim()}`,
          );
        }
        writeSearchConfig({ provider: 'tavily' });
      } else {
        writeSearchConfig({
          provider: 'searxng',
          searxngUrl: searxngUrl.trim(),
        });
      }
      grant(result.manifest);
      setTavilyKey('');
      refresh();
    } catch {
      setError('Could not save this. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.surface }}
      contentContainerStyle={{ paddingBottom: theme.space[4] }}
    >
      <Header
        title="Search"
        subtitle="Answers web-search requests in chat"
        pill={pill}
      />

      {!config ? (
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
            paddingHorizontal: theme.space[4],
            paddingBottom: theme.space[2],
          }}
        >
          Choose which service answers web-search requests. Nothing leaves the
          device until you save and grant access.
        </Text>
      ) : null}

      {manifest ? (
        <ScopeSection label="Reaches" scope={connectorScope(manifest)} />
      ) : null}

      <SectionLabel>Provider</SectionLabel>
      <View
        style={{
          paddingHorizontal: theme.space[4],
          paddingBottom: theme.space[3],
        }}
      >
        <SegmentedControl
          options={[
            { value: 'searxng', label: 'SearXNG' },
            { value: 'tavily', label: 'Tavily' },
          ]}
          value={provider}
          onChange={(next) => {
            setProvider(next);
            setError(null);
          }}
          accessibilityLabel="Search provider"
        />
      </View>

      <View
        style={{
          paddingHorizontal: theme.space[4],
          paddingBottom: theme.space[4],
          gap: theme.space[3],
        }}
      >
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
            hint={
              config?.provider === 'tavily'
                ? 'Stored in the device keychain. Leave blank to keep the current key.'
                : 'Stored in the device keychain, scoped to this connector only.'
            }
            error={error ?? undefined}
          />
        )}

        <Button
          label={config ? 'Save changes' : 'Save & grant access'}
          variant={config ? 'secondary' : 'primary'}
          onPress={() => void save()}
          loading={saving}
          fullWidth
        />

        {allowed ? (
          <Button
            label="Revoke access"
            variant="danger"
            onPress={() => manifest && void revoke(manifest).then(refresh)}
            fullWidth
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
