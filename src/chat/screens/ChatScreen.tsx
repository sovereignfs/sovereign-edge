import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ChatBubble, TextField, useTheme } from '@/design-system';

import type { ChatMessage } from '../inference';
import { useChatSession } from '../session/ChatSessionContext';

type Message = ChatMessage & { id: string; streaming?: boolean };

/**
 * The chat surface.
 *
 * History is in memory only. Per task 1.3 there is no export or sync, and
 * per research 0001 nothing here may reach the network — a connector's reply
 * arrives through the connector framework, never fetched from this screen.
 */
export function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const session = useChatSession();
  const scroll = useRef<ScrollView>(null);

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  // Held so the composer's Stop button can cancel an in-flight reply. The
  // engine supports aborting; without this the user waits it out.
  const abort = useRef<AbortController | null>(null);

  const canSend = session.status === 'ready' && draft.trim().length > 0;

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || session.status !== 'ready') return;

    const user: Message = { id: `u${Date.now()}`, role: 'user', content: text };
    const replyId = `a${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      user,
      { id: replyId, role: 'assistant', content: '', streaming: true },
    ]);
    setDraft('');

    // The model sees the conversation so far plus this turn. The placeholder
    // reply is UI-only and must not be sent as context.
    const history: ChatMessage[] = [
      ...messages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: text },
    ];

    const controller = new AbortController();
    abort.current = controller;

    try {
      await session.generate(
        history,
        (token) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId ? { ...m, content: m.content + token } : m,
            ),
          );
        },
        controller.signal,
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === replyId
            ? { ...m, content: 'That reply could not be generated.' }
            : m,
        ),
      );
    } finally {
      abort.current = null;
      setMessages((prev) =>
        prev.map((m) => (m.id === replyId ? { ...m, streaming: false } : m)),
      );
    }
  }, [draft, messages, session]);

  return (
    <KeyboardAvoidingView
      // iOS pushes content above the keyboard; Android already resizes the
      // window, and applying both double-counts the inset.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
      style={[styles.fill, { backgroundColor: theme.colors.surface }]}
    >
      <OfflineBanner />

      <ScrollView
        ref={scroll}
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: true })
        }
        contentContainerStyle={{
          paddingVertical: theme.space[3],
          gap: theme.space[1],
          flexGrow: 1,
        }}
      >
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((m) => (
            <ChatBubble
              key={m.id}
              role={m.role === 'user' ? 'user' : 'assistant'}
              text={m.content}
              streaming={m.streaming}
            />
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
            placeholder={
              session.status === 'ready' ? 'Message' : 'Not ready yet'
            }
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={send}
            returnKeyType="send"
            editable={session.status !== 'no-model'}
          />
        </View>
        {session.status === 'busy' ? (
          <Button
            label="Stop"
            variant="secondary"
            onPress={() => abort.current?.abort()}
          />
        ) : (
          <Button label="Send" onPress={send} disabled={!canSend} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * CONCEPT.md requires the active trust tier to be visible at all times, not
 * disclosed once during onboarding. While no connector exists this always
 * reads "on-device", and saying so plainly is the point rather than clutter.
 */
function OfflineBanner() {
  const theme = useTheme();
  const session = useChatSession();

  const preparing = session.status === 'preparing';
  const failed = session.status === 'error';

  return (
    <View
      style={[
        styles.banner,
        {
          paddingHorizontal: theme.space[4],
          paddingVertical: theme.space[2],
          gap: theme.space[2],
          backgroundColor: failed
            ? theme.colors.errorSurface
            : theme.colors.surfaceSunken,
          borderBottomColor: failed
            ? theme.colors.errorBorder
            : theme.colors.border,
        },
      ]}
    >
      {preparing ? <ActivityIndicator size="small" /> : null}
      <Text
        style={{
          flex: 1,
          color: failed ? theme.colors.errorText : theme.colors.textMuted,
          fontSize: theme.fontSize.caption,
          fontFamily: theme.fontFamily.body,
        }}
      >
        {session.detail ??
          (session.modelName
            ? `On-device · ${session.modelName}`
            : 'On-device · nothing leaves this phone')}
      </Text>
    </View>
  );
}

function EmptyState() {
  const theme = useTheme();
  const session = useChatSession();

  const message =
    session.status === 'no-model'
      ? 'No model is installed yet. Open Models to add one — the conversation runs entirely on this device.'
      : 'Everything you type here stays on this device.';

  return (
    <View style={[styles.empty, { padding: theme.space[6] }]}>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          fontFamily: theme.fontFamily.body,
          textAlign: 'center',
        }}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1 },
});
