import { Text, View } from 'react-native';

import { useTheme } from '../ThemeProvider';

/**
 * Maps to how well something fits (a model in memory, a download's
 * progress), not to an arbitrary brand palette — 'tight' means "will fit,
 * but barely", not "in progress".
 */
export type FitBadgeVariant = 'good' | 'tight' | 'bad' | 'neutral';

export type FitBadgeProps = { label: string; variant: FitBadgeVariant };

export function FitBadge({ label, variant }: FitBadgeProps) {
  const theme = useTheme();
  const { background, color } = colorsFor(theme, variant);

  return (
    <View
      style={{
        backgroundColor: background,
        borderRadius: theme.radius.full,
        paddingHorizontal: theme.space[2],
        paddingVertical: 2,
      }}
    >
      <Text
        style={{
          color,
          fontSize: theme.fontSize.label,
          fontFamily: theme.fontFamily.body,
          fontWeight: theme.fontWeight.medium,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function colorsFor(
  theme: ReturnType<typeof useTheme>,
  variant: FitBadgeVariant,
): { background: string; color: string } {
  switch (variant) {
    case 'good':
      return {
        background: theme.colors.successSurface,
        color: theme.colors.successText,
      };
    case 'tight':
      return {
        background: theme.colors.warningSurface,
        color: theme.colors.warningText,
      };
    case 'bad':
      return {
        background: theme.colors.errorSurface,
        color: theme.colors.errorText,
      };
    case 'neutral':
      return {
        background: theme.colors.surfaceSunken,
        color: theme.colors.textMuted,
      };
  }
}
