import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ChatBubble, TextField, useTheme } from '@/design-system';

import type { ChatMessage } from '../inference';
import { DEFAULT_MODE_ID, MODES, findMode, type ModeId } from '../modes';
import { useChatSession } from '../session/ChatSessionContext';

type Message = ChatMessage & {
  id: string;
  streaming?: boolean;
  /** Name of the connector that produced this reply, if any (task 2.5). */
  connector?: string;
};

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
  // Sticky: the chosen mode stays until changed, and the banner names it so
  // the state is never hidden. A one-off use just switches back to Chat.
  const [modeId, setModeId] = useState<ModeId>(DEFAULT_MODE_ID);
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

    // The mode's system prompt is prepended fresh each turn rather than stored
    // in `messages`, so switching mode takes effect on the next reply instead
    // of leaving a stale instruction in the history.
    //
    // Prior turns go only to plain chat. Sending them to a writing-assist mode
    // was measured to defeat it outright: with grammar corrections in the
    // transcript, Brainstorm returned another correction rather than ideas.
    // See `usesHistory` in ../modes.
    const mode = findMode(modeId);
    const history: ChatMessage[] = [
      ...(mode.systemPrompt
        ? [{ role: 'system' as const, content: mode.systemPrompt }]
        : []),
      ...(mode.usesHistory
        ? messages.map(({ role, content }) => ({ role, content }))
        : []),
      { role: 'user', content: text },
    ];

    const controller = new AbortController();
    abort.current = controller;

    try {
      // Only a real conversation may reach a connector at all — the
      // writing-assist modes are transformations of the text handed to
      // them, not conversations (see `usesHistory` above), and offering one
      // a connector would be a category error regardless of whether one is
      // even installed. Plain Chat leaves the decision to the model
      // ('auto'); Search forces it ('required') — its own mode selection is
      // the decision, not a judgment call left to a small model that has
      // been measured getting it wrong both directions.
      const connectorMode =
        modeId === 'search' ? 'required' : modeId === 'plain' ? 'auto' : 'off';
      const result = await session.generate({
        messages: history,
        onToken: (token) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === replyId ? { ...m, content: m.content + token } : m,
            ),
          );
        },
        signal: controller.signal,
        temperature: mode.temperature,
        connectorMode,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === replyId
            ? // Set from the resolved result, not just accumulated onToken
              // calls: a routed reply that never streams — blocked by a
              // missing permission, or any other connector fallback — calls
              // onToken zero times, and content built purely from streaming
              // would stay empty forever despite `generate()` having
              // resolved with real text to show.
              {
                ...m,
                content: result.text,
                connector: result.connector ?? undefined,
              }
            : m,
        ),
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
  }, [draft, messages, modeId, session]);

  return (
    <KeyboardAvoidingView
      // iOS pushes content above the keyboard; Android already resizes the
      // window, and applying both double-counts the inset.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
      style={[styles.fill, { backgroundColor: theme.colors.surface }]}
    >
      <OfflineBanner modeId={modeId} />

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
              connector={m.connector}
            />
          ))
        )}
      </ScrollView>

      <ModeBar active={modeId} onChange={setModeId} />

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
 * The writing-assist modes (task 1.4), as a row of chips above the composer.
 *
 * Placed here rather than in a menu because the mode is sticky: it has to be
 * visible next to the thing it changes, or the user types into a transform
 * they have forgotten is on.
 */
function ModeBar({
  active,
  onChange,
}: {
  active: ModeId;
  onChange: (id: ModeId) => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: theme.space[3],
        paddingVertical: theme.space[2],
        gap: theme.space[2],
      }}
      style={{
        // `flexGrow: 0` alone is not enough: a ScrollView defaults to
        // `flexShrink: 1`, so once the conversation grew tall this row was
        // squeezed until the chip labels were clipped to slivers. Found by
        // using the app, not by reading it — it looks correct while the
        // thread is short.
        flexGrow: 0,
        flexShrink: 0,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      {MODES.map((mode) => {
        const selected = mode.id === active;
        return (
          <Pressable
            key={mode.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${mode.label} mode`}
            onPress={() => onChange(mode.id)}
            style={({ pressed }) => [
              styles.chip,
              {
                paddingHorizontal: theme.space[3],
                paddingVertical: theme.space[2],
                borderRadius: theme.radius.full,
                borderColor: selected
                  ? theme.colors.accent
                  : theme.colors.border,
                backgroundColor: selected
                  ? theme.colors.accent
                  : theme.colors.surface,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: selected
                  ? theme.colors.textOnAccent
                  : theme.colors.textMuted,
                fontSize: theme.fontSize.caption,
                fontFamily: theme.fontFamily.body,
              }}
            >
              {mode.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * CONCEPT.md requires the active trust tier to be visible at all times, not
 * disclosed once during onboarding. While no connector exists this always
 * reads "on-device", and saying so plainly is the point rather than clutter.
 *
 * It also carries the active writing-assist mode. A sticky mode that is not
 * shown is a trap: the next thing the user types gets silently transformed.
 */
function OfflineBanner({ modeId }: { modeId: ModeId }) {
  const theme = useTheme();
  const session = useChatSession();

  const preparing = session.status === 'preparing';
  const failed = session.status === 'error';
  const mode = findMode(modeId);

  // A measured limitation of the loaded model, not a general disclaimer about
  // AI. It appears only for the mode and the sizes where fabrication was
  // actually observed, so it stays worth reading.
  const risky =
    mode.cautionBelowB !== null &&
    session.modelParametersB !== null &&
    session.modelParametersB < mode.cautionBelowB;

  return (
    <View>
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
            [
              session.modelName
                ? `On-device · ${session.modelName}`
                : 'On-device · nothing leaves this phone',
              // Only when a mode other than the default is on. Saying "Plain
              // chat" on every screen would be noise on the default nobody
              // chose. Keyed off the id rather than `systemPrompt` — Search
              // has no system prompt (its whole effect is the forced
              // `connectorMode`, not a model instruction) but still needs
              // its banner shown: it is the one mode that reaches the
              // network on every message, which is exactly what this
              // banner exists to make visible.
              mode.id !== DEFAULT_MODE_ID ? mode.banner : null,
            ]
              .filter(Boolean)
              .join(' · ')}
        </Text>
      </View>

      {risky ? (
        <View
          style={[
            styles.banner,
            {
              paddingHorizontal: theme.space[4],
              paddingVertical: theme.space[2],
              backgroundColor: theme.colors.warningSurface,
              borderBottomColor: theme.colors.warningBorder,
            },
          ]}
        >
          <Text
            style={{
              flex: 1,
              color: theme.colors.warningText,
              fontSize: theme.fontSize.caption,
              fontFamily: theme.fontFamily.body,
            }}
          >
            {`${session.modelName} is small enough to invent details that were not in your notes — it has produced figures nobody typed. Check any draft before sending it, or switch to a larger model in Models.`}
          </Text>
        </View>
      ) : null}
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
  chip: { borderWidth: StyleSheet.hairlineWidth },
});
