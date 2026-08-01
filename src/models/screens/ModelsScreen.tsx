import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ListItem, useTheme } from '@/design-system';
import {
  useModelSession,
  type ModelDownload,
} from '@/settings/ModelSessionProvider';

/**
 * Model manager UI.
 *
 * Reads the app-wide session rather than constructing its own manager, so
 * deleting a model releases it from the engine the chat screen is using. Two
 * independent managers could not coordinate that, and removing a file the
 * engine still has memory-mapped is undefined behaviour rather than an error.
 */
export function ModelsScreen() {
  const theme = useTheme();
  const {
    models,
    remove,
    activate,
    activeModelId,
    install,
    cancelInstall,
    downloads,
  } = useModelSession();

  const gb = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;

  const onPress = useCallback(
    (id: string, installed: boolean, download: ModelDownload | undefined) => {
      // Tapping a live download cancels it. That is the only stop control, so
      // it must stay reachable for the whole transfer.
      if (
        download &&
        (download.phase === 'downloading' || download.phase === 'verifying')
      ) {
        return () => cancelInstall(id);
      }
      if (!installed) return () => install(id);
      return id === activeModelId ? () => remove(id) : () => activate(id);
    },
    [activeModelId, activate, cancelInstall, install, remove],
  );

  return (
    <ScrollView style={{ backgroundColor: theme.colors.surface }}>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.caption,
          fontFamily: theme.fontFamily.body,
          paddingHorizontal: theme.space[4],
          paddingTop: theme.space[4],
          paddingBottom: theme.space[2],
        }}
      >
        Models run entirely on this device. Larger ones answer better and need
        more memory.
      </Text>

      <View>
        {models.map((model) => {
          const active = model.id === activeModelId;
          const download = downloads[model.id];
          return (
            <ListItem
              key={model.id}
              title={`${model.name} · ${model.parameters}`}
              // The fit note is the useful part — it says whether *this* phone
              // can run it, which a size alone does not.
              subtitle={
                subtitleFor(download) ??
                idleSubtitle(gb(model.sizeBytes), model.fit.note, {
                  installed: model.installed,
                  active,
                })
              }
              accessory={
                <Accessory
                  installed={model.installed}
                  active={active}
                  download={download}
                />
              }
              onPress={onPress(model.id, model.installed, download)}
              // Only a failed download is an error. The loaded model was also
              // drawn in the error colour once, which read as "something is
              // wrong with this one" directly beside a green IN USE badge —
              // two opposite signals on the same row. What tapping does is
              // said in words in the subtitle instead.
              destructive={download?.phase === 'failed'}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

/**
 * What an idle row says, including what pressing it will do.
 *
 * Downloading rows already end in "tap to cancel"; saying it here too means no
 * row is a pressable mystery, which matters most for the loaded model, where
 * the action is deletion.
 */
function idleSubtitle(
  size: string,
  fitNote: string,
  state: { installed: boolean; active: boolean },
): string {
  const base = `${size} · ${fitNote}`;
  if (state.active) return `${base} · tap to remove`;
  if (state.installed) return `${base} · tap to use`;
  return base;
}

/**
 * What the row says while something is happening to it.
 *
 * A download is the longest wait in the app and the epic's rule is that it may
 * never look silently stuck, so every phase names itself and a failure shows
 * its own message rather than a generic one.
 */
function subtitleFor(download: ModelDownload | undefined): string | undefined {
  if (!download) return undefined;

  switch (download.phase) {
    case 'downloading': {
      const pct =
        download.fraction === null
          ? null
          : `${Math.floor(download.fraction * 100)}%`;
      const size =
        download.totalBytes === null
          ? `${(download.bytesWritten / 1e6).toFixed(0)} MB so far`
          : `${(download.bytesWritten / 1e9).toFixed(2)} of ${(download.totalBytes / 1e9).toFixed(2)} GB`;
      // No percentage when the server sends no Content-Length — inventing one
      // would be a worse lie than admitting the total is unknown.
      return pct
        ? `Downloading ${pct} · ${size} · tap to cancel`
        : `Downloading · ${size} · tap to cancel`;
    }
    case 'verifying':
      return 'Checking the file matches the publisher’s checksum.';
    case 'failed':
      return download.error ?? 'The download failed. Tap to try again.';
    default:
      return undefined;
  }
}

function Accessory({
  installed,
  active,
  download,
}: {
  installed: boolean;
  active: boolean;
  download: ModelDownload | undefined;
}) {
  const theme = useTheme();

  const label = (() => {
    if (download?.phase === 'downloading' || download?.phase === 'verifying') {
      return 'CANCEL';
    }
    if (download?.phase === 'failed') return 'RETRY';
    if (!installed) return 'DOWNLOAD';
    return active ? 'IN USE' : 'INSTALLED';
  })();

  const colour = (() => {
    if (download?.phase === 'failed') return theme.colors.errorText;
    if (active) return theme.colors.successText;
    if (!installed) return theme.colors.accent;
    return theme.colors.textMuted;
  })();

  return (
    <Text
      style={{
        color: colour,
        fontSize: theme.fontSize.label,
        fontFamily: theme.fontFamily.mono,
      }}
    >
      {label}
    </Text>
  );
}
