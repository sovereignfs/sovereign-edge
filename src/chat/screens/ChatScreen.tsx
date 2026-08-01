import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ChatBubble, TextField, useTheme } from '@/design-system';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

/**
 * The chat surface.
 *
 * Shell only: it composes the real components and holds message state, but
 * does not call the inference engine yet — wiring that in is task 1.3. The
 * screen exists now so 8.1's navigation has something real to navigate to,
 * and so the layout problems (keyboard avoidance, scroll anchoring) are
 * solved before generation is added on top.
 *
 * Nothing here may reach the network: `src/chat/` is the offline half of the
 * product, and a connector's reply arrives through the connector framework
 * rather than being fetched from this screen.
 */
export function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}`, role: 'user', text },
    ]);
    setDraft('');
  };

  return (
    <KeyboardAvoidingView
      // iOS pushes content above the keyboard; Android already resizes the
      // window, and applying both double-counts the inset.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
      style={[styles.fill, { backgroundColor: theme.colors.surface }]}
    >
      <ScrollView
        contentContainerStyle={{
          paddingVertical: theme.space[3],
          gap: theme.space[1],
          flexGrow: 1,
        }}
      >
        {messages.length === 0 ? (
          <View style={[styles.empty, { padding: theme.space[6] }]}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.sm,
                fontFamily: theme.fontFamily.body,
                textAlign: 'center',
              }}
            >
              Everything you type here stays on this device.
            </Text>
          </View>
        ) : (
          messages.map((m) => (
            <ChatBubble key={m.id} role={m.role} text={m.text} />
          ))
        )}
      </ScrollView>

      <View
        style={[
          styles.composer,
          {
            padding: theme.space[3],
            gap: theme.space[2],
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            paddingBottom: theme.space[3] + insets.bottom,
          },
        ]}
      >
        <View style={styles.grow}>
          <TextField
            placeholder="Message"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            returnKeyType="send"
          />
        </View>
        <Button label="Send" onPress={send} disabled={draft.trim() === ''} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1 },
});
