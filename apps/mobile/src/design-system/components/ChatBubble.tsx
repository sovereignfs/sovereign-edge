import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../ThemeProvider';
import { Mark } from './Mark';
import { Markdown } from './Markdown';

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
      <View style={{ maxWidth: '85%', gap: theme.space[1] }}>
        <View
          style={{
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
          }}
        >
          {isUser ? (
            // The user's own typed text is shown verbatim — it's what they
            // wrote, not a reply to render, so `**` in it means literally
            // two asterisks, not a formatting instruction they never gave.
            <Text
              style={{
                color: theme.colors.textOnAccent,
                fontSize: theme.fontSize.sm,
                fontFamily: theme.fontFamily.body,
              }}
            >
              {text}
            </Text>
          ) : (
            <Markdown
              text={streaming ? `${text}▌` : text}
              color={theme.colors.textPrimary}
              fontSize={theme.fontSize.sm}
              fontFamily={theme.fontFamily.body}
            />
          )}
        </View>

        {connector ? (
          <View
            style={[styles.receipt, isUser ? styles.receiptEnd : null]}
            accessibilityLabel={`Answered using the ${connector} connector`}
          >
            <Mark size={11} color={theme.colors.textSubtle} />
            <Text
              style={{
                color: theme.colors.textSubtle,
                fontSize: theme.fontSize.label,
                fontFamily: theme.fontFamily.body,
              }}
            >
              {connector}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  alignStart: { justifyContent: 'flex-start' },
  alignEnd: { justifyContent: 'flex-end' },
  // Nudged in from the bubble's own edge rather than flush with it — reads
  // as "attached to" the bubble above, not as its own separate row.
  receipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 10,
  },
  receiptEnd: { alignSelf: 'flex-end', marginLeft: 0, marginRight: 10 },
});
