import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../ThemeProvider';
import type { Theme } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks presses. Distinct from `disabled`. */
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

function colorsFor(theme: Theme, variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return {
        background: theme.colors.accent,
        pressed: theme.colors.accentHover,
        text: theme.colors.textOnAccent,
        border: 'transparent',
      };
    case 'secondary':
      return {
        background: theme.colors.surface,
        pressed: theme.colors.surfaceSunken,
        text: theme.colors.textPrimary,
        border: theme.colors.borderStrong,
      };
    case 'ghost':
      return {
        background: 'transparent',
        pressed: theme.colors.accentSubtle,
        text: theme.colors.textPrimary,
        border: 'transparent',
      };
    case 'danger':
      return {
        background: theme.colors.errorSolid,
        pressed: theme.colors.errorSolid,
        text: theme.colors.textOnError,
        border: 'transparent',
      };
  }
}

/**
 * The `accessibilityState`/`accessibilityRole` pairing is not decoration: a
 * screen reader announcing a disabled button as actionable is a bug that no
 * visual review catches.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const c = colorsFor(theme, variant);
  const inactive = disabled === true || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed && !inactive ? c.pressed : c.background,
          borderColor: c.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: size === 'sm' ? theme.space[3] : theme.space[4],
          // Height, not padding: a button shorter than the platform minimum
          // is hard to hit regardless of how its label is spaced.
          minHeight: size === 'sm' ? theme.space[8] : theme.touchTargetMin,
          opacity: inactive ? 0.5 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={c.text} />
        ) : (
          <Text
            numberOfLines={1}
            style={{
              color: c.text,
              fontSize:
                size === 'sm' ? theme.fontSize.caption : theme.fontSize.sm,
              fontWeight: theme.fontWeight.medium,
              fontFamily: theme.fontFamily.body,
            }}
          >
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// Layout only. Everything theme-derived is applied inline above, so a token
// change lands everywhere at once.
const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { alignItems: 'center', justifyContent: 'center' },
});
