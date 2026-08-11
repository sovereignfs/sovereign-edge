import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../ThemeProvider';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** Shown below the field and announced to screen readers. */
  error?: string;
  /** Shown below the field when there is no error. */
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  error,
  hint,
  containerStyle,
  editable = true,
  onFocus,
  onBlur,
  multiline = false,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const invalid = Boolean(error);

  // Focus wins over error for the border: the user is acting on the field
  // right now, and the message below still carries the error.
  const borderColor = invalid
    ? theme.colors.errorBorder
    : focused
      ? theme.colors.focusRing
      : theme.colors.border;

  return (
    <View style={[styles.container, { gap: theme.space[1] }, containerStyle]}>
      {label ? (
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {label}
        </Text>
      ) : null}

      <TextInput
        accessibilityLabel={label}
        // Without this a screen reader reads the field as valid while the
        // error text sits visibly underneath it.
        accessibilityState={{ disabled: !editable }}
        editable={editable}
        multiline={multiline}
        placeholderTextColor={theme.colors.textSubtle}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={{
          minHeight: theme.touchTargetMin,
          // A composer that could grow to fill the screen on a long paste
          // is worse than one that scrolls internally past a point — three
          // lines' worth is enough to see what's being sent without eating
          // the message list above it.
          maxHeight: multiline ? theme.touchTargetMin * 3 : undefined,
          paddingHorizontal: theme.space[3],
          paddingVertical: theme.space[2],
          borderWidth: 1,
          borderColor,
          borderRadius: theme.radius.md,
          backgroundColor: editable
            ? theme.colors.surface
            : theme.colors.surfaceSunken,
          color: theme.colors.textPrimary,
          fontSize: theme.fontSize.sm,
          fontFamily: theme.fontFamily.body,
          // Multiline text starts at the top of the field, like every other
          // messaging composer; centred looks fine at one line and wrong at
          // three. Android needs this stated explicitly.
          textAlignVertical: multiline ? 'top' : 'center',
        }}
        {...rest}
      />

      {invalid || hint ? (
        <Text
          style={{
            color: invalid ? theme.colors.errorText : theme.colors.textMuted,
            fontSize: theme.fontSize.caption,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch' },
});
