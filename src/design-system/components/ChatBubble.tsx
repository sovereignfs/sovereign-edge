import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../ThemeProvider';

export type ChatBubbleProps = {
  role: 'user' | 'assistant';
  text: string;
  /**
   * The reply is still being generated. Shows a caret so an empty or
   * part-written message reads as in-progress rather than finished.
   */
  streaming?: boolean;
  /**
   * Name of the connector that produced this reply, when one did.
   *
   * Central to the product's promise, not a nicety: research 0001 requires
   * the UI to show which connector touched the network for a given reply.
   * Absent means the answer came entirely from the local model.
   */
  connector?: string;
};

export function ChatBubble({
  role,
  text,
  streaming = false,
  connector,
}: ChatBubbleProps) {
  const theme = useTheme();
  const isUser = role === 'user';

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${isUser ? 'You' : 'Assistant'}: ${text}`}
      style={[
        styles.row,
        { paddingVertical: theme.space[1], paddingHorizontal: theme.space[4] },
        isUser ? styles.alignEnd : styles.alignStart,
      ]}
    >
      <View
        style={{
          maxWidth: '85%',
          backgroundColor: isUser
            ? theme.colors.accent
            : theme.colors.surfaceSunken,
          paddingHorizontal: theme.space[3],
          paddingVertical: theme.space[2],
          borderRadius: theme.radius.xl,
          // Squaring the trailing corner points the bubble at its sender —
          // cheaper than a tail and it survives long text reflowing.
          borderBottomRightRadius: isUser ? theme.radius.sm : theme.radius.xl,
          borderBottomLeftRadius: isUser ? theme.radius.xl : theme.radius.sm,
          gap: theme.space[1],
        }}
      >
        <Text
          style={{
            color: isUser
              ? theme.colors.textOnAccent
              : theme.colors.textPrimary,
            fontSize: theme.fontSize.sm,
            fontFamily: theme.fontFamily.body,
          }}
        >
          {text}
          {streaming ? '▌' : ''}
        </Text>

        {connector ? (
          <Text
            style={{
              color: isUser
                ? theme.colors.textOnAccent
                : theme.colors.textMuted,
              fontSize: theme.fontSize.label,
              fontFamily: theme.fontFamily.mono,
            }}
          >
            {`via ${connector}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  alignStart: { justifyContent: 'flex-start' },
  alignEnd: { justifyContent: 'flex-end' },
});
