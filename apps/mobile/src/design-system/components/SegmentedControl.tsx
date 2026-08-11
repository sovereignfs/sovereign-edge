import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/**
 * A real mutually-exclusive control for a small, fixed set of options —
 * replacing the previous pattern of N `Toggle`s standing in for a radio
 * group, where every option but one had to be manually driven back to
 * `false`.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.md,
        padding: 2,
        gap: 2,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              {
                flex: 1,
                alignItems: 'center',
                paddingVertical: theme.space[2],
                borderRadius: theme.radius.md - 2,
                backgroundColor: active
                  ? theme.colors.surfaceRaised
                  : undefined,
                opacity: pressed ? 0.7 : 1,
              },
              // The active segment's own elevation, not just its fill —
              // `surfaceRaised` equals `surfaceSunken` in dark mode, so
              // colour alone would leave the selection invisible there.
              active ? theme.shadows.control : undefined,
            ]}
          >
            <Text
              style={{
                fontSize: theme.fontSize.caption,
                fontFamily: theme.fontFamily.body,
                fontWeight: active
                  ? theme.fontWeight.medium
                  : theme.fontWeight.regular,
                color: active
                  ? theme.colors.textPrimary
                  : theme.colors.textMuted,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
