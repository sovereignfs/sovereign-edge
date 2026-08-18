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

import {
  ChatBubble,
  Icon,
  TextField,
  useTheme,
  type IconName,
} from '@/design-system';

import type { ChatMessage } from '../inference';
import { DEFAULT_MODE_ID, MODES, findMode, type ModeId } from '../modes';
import { useChatSession } from '../session/ChatSessionContext';
import { capMessages, type Message } from '../session/messages';

/** One icon per writing-assist mode, shown ahead of its chip label. */
const MODE_ICON: Record<ModeId, IconName> = {
  plain: 'message-circle',
  search: 'search',
  brainstorm: 'lightbulb',
  grammar: 'spell-check',
  tone: 'wand-2',
  draft: 'file-text',
};

/**
 * The chat surface.
 *
 * A single persisted thread, capped to a bounded size rather than kept
 * forever or expired by time (`session/messages.ts` carries the sizing
 * reasoning; the persistence itself is `session.loadHistory`/`saveHistory`
 * — implemented in the app shell, not here, since `src/chat/` may not
 * touch the filesystem). Per task 1.3 there is still no export or sync, and
 * per research 0001 nothing here may reach the network — a connector's
 * reply arrives through the connector framework, never fetched from this
 * screen.
 */
export function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const session = useChatSession();
  const scroll = useRef<ScrollView>(null);

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>(() =>
    session.loadHistory(),
  );
  // Mirrors `messages`, updated in lockstep by `updateMessages` below.
  // `setState`'s updater callback is not guaranteed to run synchronously —
  // it runs whenever React actually processes the queued update, which is
  // not "the next line" — so code that needs the *new* array right away
  // (persisting it, folding it into the next request) cannot get it back
  // out of `setMessages` itself. This ref is what makes that possible.
  const messagesRef = useRef(messages);
  const updateMessages = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      const next = updater(messagesRef.current);
      messagesRef.current = next;
      setMessages(next);
      return next;
    },
    [],
  );
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

    // Snapshotted before `updateMessages` below appends this turn's own
    // pair — `history` (built further down) needs "everything before this
    // message", and appends the user's text itself separately, the same
    // split the pre-persistence code already made using the `messages`
    // state variable. `messagesRef.current` can't stand in for that
    // directly: by the time `history` is built, the ref already includes
    // the pair just appended, which would double up the user's own text.
    const priorMessages = messagesRef.current;

    const user: Message = { id: `u${Date.now()}`, role: 'user', content: text };
    const replyId = `a${Date.now()}`;
    // Persisted here, not only once the reply settles, so the question
    // survives a kill mid-generation even though the answer might not —
    // and capped here too, not only on load, so the list this turn's own
    // request is built from never grows unbounded across a long session.
    session.saveHistory(
      updateMessages((prev) =>
        capMessages([
          ...prev,
          user,
          { id: replyId, role: 'assistant', content: '', streaming: true },
        ]),
      ),
    );
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
        ? priorMessages.map(({ role, content }) => ({ role, content }))
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
          updateMessages((prev) =>
            prev.map((m) =>
              m.id === replyId ? { ...m, content: m.content + token } : m,
            ),
          );
        },
        signal: controller.signal,
        temperature: mode.temperature,
        connectorMode,
      });
      updateMessages((prev) =>
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
      updateMessages((prev) =>
        prev.map((m) =>
          m.id === replyId
            ? { ...m, content: 'That reply could not be generated.' }
            : m,
        ),
      );
    } finally {
      abort.current = null;
      session.saveHistory(
        updateMessages((prev) =>
          prev.map((m) => (m.id === replyId ? { ...m, streaming: false } : m)),
        ),
      );
    }
  }, [draft, modeId, session, updateMessages]);

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
            paddingHorizontal: theme.space[3],
            paddingTop: theme.space[2],
            gap: theme.space[2],
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
            // No `+ insets.bottom` here: this screen lives inside a bottom
            // tab navigator, whose tab bar already reserves the home-
            // indicator safe area on its own. Adding it again here counted
            // it twice, leaving a dead strip between the composer and the
            // tab bar rather than clearing anything real.
            paddingBottom: theme.space[2],
          },
        ]}
      >
        <View style={styles.grow}>
          <TextField
            placeholder={
              session.status === 'ready'
                ? "What's on your mind?"
                : 'Not ready yet'
            }
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={session.status !== 'no-model'}
          />
        </View>
        {session.status === 'busy' ? (
          <ComposerButton
            icon="square"
            label="Stop generating"
            variant="secondary"
            onPress={() => abort.current?.abort()}
          />
        ) : (
          <ComposerButton
            icon="send"
            label="Send"
            variant="primary"
            onPress={send}
            disabled={!canSend}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Icon-only, so it stays compact beside a composer that now grows past one
 * line — a full-width "Send" label would either wrap awkwardly or force
 * the text field narrower every time the draft grows to a second line.
 */
function ComposerButton({
  icon,
  label,
  variant,
  onPress,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  variant: 'primary' | 'secondary';
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.composerButton,
        {
          width: theme.touchTargetMin,
          height: theme.touchTargetMin,
          borderRadius: theme.radius.full,
          backgroundColor: primary ? theme.colors.accent : 'transparent',
          borderColor: primary ? 'transparent' : theme.colors.borderStrong,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Icon
        name={icon}
        size="md"
        color={primary ? theme.colors.textOnAccent : theme.colors.textPrimary}
        aria-hidden
      />
    </Pressable>
  );
}

/**
 * `theme.colors.border` at reduced opacity, so a full 1pt line reads as
 * softly as a hairline of the same color would — a hairline's antialiasing
 * partly blends it into the background for free, which a solid-width line
 * of the same color doesn't get. Local to this screen rather than a new
 * design-tokens entry: `packages/design-tokens` is shared with desktop, and
 * this is a one-off touch-up to a single row on a single screen, not a
 * reusable semantic color.
 */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  const borderMuted = withAlpha(theme.colors.border, 0.5);

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
        // A full `1`, not `StyleSheet.hairlineWidth`, for the same
        // reliability reason as the tab bar's border — hairline can round
        // down to an invisible sub-pixel line depending on device scale
        // factor, which is exactly what happened here. But at solid,
        // full-strength `theme.colors.border` a real 1pt line reads
        // noticeably darker than a hairline of the same color ever does —
        // a hairline's antialiasing partly blends it into the background,
        // which a full-width line doesn't get for free. `borderMuted`
        // is that same color, alpha-blended by hand toward
        // `theme.colors.surface`, to reproduce that softer look at a
        // width that actually renders.
        borderTopWidth: 1,
        borderTopColor: borderMuted,
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
                gap: theme.space[1],
                paddingHorizontal: theme.space[2] + 1,
                paddingVertical: theme.space[1],
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
            <Icon
              name={MODE_ICON[mode.id]}
              size="xs"
              color={
                selected ? theme.colors.textOnAccent : theme.colors.textMuted
              }
              aria-hidden
            />
            <Text
              style={{
                color: selected
                  ? theme.colors.textOnAccent
                  : theme.colors.textMuted,
                fontSize: theme.fontSize.xs,
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
        {preparing ? (
          <ActivityIndicator size="small" />
        ) : (
          // Calm "offline by design" signal in the steady state; the same
          // slot becomes an explicit warning glyph if preparation failed —
          // two different messages should not share one icon.
          <Icon
            name={failed ? 'alert-triangle' : 'wifi-off'}
            size="xs"
            color={failed ? theme.colors.errorText : theme.colors.textMuted}
            aria-hidden
          />
        )}
        <Text
          // Only the transient `session.detail` text (loading/error) is
          // pinned to one line — that's the one case actually behind the
          // original bug: `modeId` always starts at `DEFAULT_MODE_ID` on
          // mount (no persistence across launches), so the preparing→ready
          // transition every session goes through happens while the
          // steady-state text is still short and single-line. Truncating
          // just the loading sentence to match that keeps the auto-load
          // transition flash-free without constraining anything else.
          //
          // The steady-state text (model name + optional mode banner)
          // deliberately has no line cap and no reserved height: it only
          // ever changes height in direct response to the user tapping a
          // mode chip, which is an expected, immediate consequence of their
          // own action — not the same "unprompted resize" the original bug
          // was about — so there is nothing here worth constraining.
          numberOfLines={session.detail ? 1 : undefined}
          ellipsizeMode="tail"
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
              gap: theme.space[2],
              backgroundColor: theme.colors.warningSurface,
              borderBottomColor: theme.colors.warningBorder,
            },
          ]}
        >
          <Icon
            name="alert-triangle"
            size="xs"
            color={theme.colors.warningText}
            aria-hidden
          />
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
    // Bottom-anchored, not centred or top-anchored: as the field grows
    // past one line the button should stay next to the newest line of
    // text and the user's thumb, not float in the middle of a tall box.
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grow: { flex: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  composerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
