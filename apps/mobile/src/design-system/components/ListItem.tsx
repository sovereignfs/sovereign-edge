import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type ListItemProps = {
  title: string;
  subtitle?: string;
  /** Trailing control — a Toggle, a chevron, a size label. */
  accessory?: ReactNode;
  /** Extra content below the subtitle, in the same column — a progress bar. */
  footer?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Renders title and subtitle in the error colour. */
  destructive?: boolean;
};

export function ListItem({
  title,
  subtitle,
  accessory,
  footer,
  onPress,
  disabled = false,
  destructive = false,
}: ListItemProps) {
  const theme = useTheme();
  const titleColor = destructive
    ? theme.colors.errorText
    : theme.colors.textPrimary;

  const body = (
    <View
      style={[
        styles.row,
        {
          minHeight: theme.touchTargetMin,
          paddingHorizontal: theme.space[4],
          paddingVertical: theme.space[3],
          gap: theme.space[3],
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.text}>
        <Text
          numberOfLines={1}
          style={{
            color: titleColor,
            fontSize: theme.fontSize.sm,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.caption,
              fontFamily: theme.fontFamily.body,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
        {footer}
      </View>
      {accessory}
    </View>
  );

  // A non-pressable row must not be announced as a button, so the Pressable
  // is omitted entirely rather than disabled.
  if (!onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1 },
  pressed: { opacity: 0.6 },
});
