import { View } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type ProgressBarProps = {
  /** 0–1. Values outside that range are clamped rather than rejected. */
  progress: number;
};

export function ProgressBar({ progress }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{
        height: 6,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceSunken,
        overflow: 'hidden',
        marginTop: theme.space[1],
      }}
    >
      <View
        style={{
          height: '100%',
          width: `${clamped * 100}%`,
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.full,
        }}
      />
    </View>
  );
}
