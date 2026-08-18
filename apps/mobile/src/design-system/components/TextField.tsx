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

      {/* The border/background/height live here, not on the TextInput
          itself, and centring is plain `justifyContent`, not any
          text-vertical-align API. Both `textAlignVertical` (Android-only)
          and its cross-platform replacement `verticalAlign` turned out not
          to reliably centre a *multiline* TextInput's content on iOS in
          practice — a real platform limitation of the underlying
          UITextView, not a typo — so this sidesteps the question rather
          than depending on it: the TextInput is left borderless and sized
          to its own content (no forced minHeight of its own), and this
          wrapper's `justifyContent: 'center'` centres that content within
          the full 44pt box the same way it would centre any other child,
          which every platform's flexbox implementation already gets right. */}
      <View
        style={{
          minHeight: theme.touchTargetMin,
          justifyContent: 'center',
          paddingHorizontal: theme.space[3],
          borderWidth: 1,
          borderColor,
          borderRadius: theme.radius.md,
          backgroundColor: editable
            ? theme.colors.surface
            : theme.colors.surfaceSunken,
        }}
      >
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
            // A composer that could grow to fill the screen on a long
            // paste is worse than one that scrolls internally past a
            // point — three lines' worth is enough to see what's being
            // sent without eating the message list above it. Kept on the
            // TextInput itself, not the wrapper, so RN's native
            // grow-then-internally-scroll behaviour still applies past
            // this point — a wrapper that merely clipped a taller child
            // would lose that.
            maxHeight: multiline ? theme.touchTargetMin * 3 : undefined,
            paddingVertical: theme.space[2],
            color: theme.colors.textPrimary,
            fontSize: theme.fontSize.sm,
            fontFamily: theme.fontFamily.body,
          }}
          {...rest}
        />
      </View>

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
