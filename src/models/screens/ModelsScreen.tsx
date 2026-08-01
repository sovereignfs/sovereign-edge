import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ListItem, useTheme } from '@/design-system';

import { ModelManager, type ManagedModel } from '../manager';

/**
 * Model manager UI.
 *
 * Lists the catalog annotated for this device and lets a model be removed.
 * Downloading is intentionally not wired up here yet: it needs progress and
 * cancellation UI to be honest about a multi-gigabyte transfer, and putting a
 * bare "Install" button in front of that would be worse than leaving it out.
 * The underlying pipeline is complete (task 0.4) and verified.
 */
export function ModelsScreen() {
  const theme = useTheme();
  const manager = useMemo(() => new ModelManager(), []);
  const [models, setModels] = useState<ManagedModel[]>(() => manager.list());

  const refresh = useCallback(() => setModels(manager.list()), [manager]);

  const remove = useCallback(
    async (id: string) => {
      await manager.remove(id);
      refresh();
    },
    [manager, refresh],
  );

  const gb = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;

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
        {models.map((model) => (
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
                    color: theme.colors.successText,
                    fontSize: theme.fontSize.label,
                    fontFamily: theme.fontFamily.mono,
                  }}
                >
                  INSTALLED
                </Text>
              ) : undefined
            }
            onPress={model.installed ? () => remove(model.id) : undefined}
            destructive={model.installed}
          />
        ))}
      </View>
    </ScrollView>
  );
}
