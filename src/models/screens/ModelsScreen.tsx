import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ListItem, useTheme } from '@/design-system';
import { useModelSession } from '@/settings/ModelSessionProvider';

/**
 * Model manager UI.
 *
 * Reads the app-wide session rather than constructing its own manager, so
 * deleting a model releases it from the engine the chat screen is using. Two
 * independent managers could not coordinate that, and removing a file the
 * engine still has memory-mapped is undefined behaviour rather than an error.
 *
 * Downloading is still not wired up: it needs progress and cancellation UI to
 * be honest about a multi-gigabyte transfer. The pipeline behind it is
 * complete and verified (task 0.4).
 */
export function ModelsScreen() {
  const theme = useTheme();
  const { models, remove, activate, activeModelId } = useModelSession();

  const gb = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;

  const onPress = useCallback(
    (id: string, installed: boolean) => {
      if (!installed) return undefined;
      return id === activeModelId ? () => remove(id) : () => activate(id);
    },
    [activeModelId, activate, remove],
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
          return (
            <ListItem
              key={model.id}
              title={`${model.name} · ${model.parameters}`}
              // The fit note is the useful part — it says whether *this* phone
              // can run it, which a size alone does not.
              subtitle={`${gb(model.sizeBytes)} · ${model.fit.note}`}
              accessory={
                model.installed ? (
                  <Text
                    style={{
                      color: active
                        ? theme.colors.successText
                        : theme.colors.textMuted,
                      fontSize: theme.fontSize.label,
                      fontFamily: theme.fontFamily.mono,
                    }}
                  >
                    {active ? 'IN USE' : 'INSTALLED'}
                  </Text>
                ) : undefined
              }
              onPress={onPress(model.id, model.installed)}
              destructive={active}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}
