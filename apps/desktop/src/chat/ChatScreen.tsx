import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Button, ChatBubble, Icon, useTheme, type IconName } from 'desktop-ui';
import styles from './ChatScreen.module.css';
import {
  activeModelId,
  cancelGeneration,
  connectorStatus,
  generateChat,
  listModels,
  loadModel,
  onGenerateToken,
  type ChatMessage,
  type ManagedModel,
} from '../lib/tauri';
import { ModeBar } from './ModeBar';
import { DEFAULT_MODE_ID, findMode, type ModeId } from './modes';

/**
 * Task 13.5's own scope: close the loop epic 13 opened in task 12.7.
 * Model selection and connector consent now live in their own real
 * screens (tasks 13.2, 13.3) — this screen goes back to being just chat,
 * mirroring how mobile's own `ChatScreen.tsx` stays chat-only and defers
 * model/connector management to its own screens entirely. What's left
 * here is exactly task 12.7's original `send()` (streaming via `on_token`,
 * overwrite-from-final-result rather than trust the accumulated stream,
 * connector tag from the result not guessed at) plus a compact model/
 * connector indicator that links out instead of managing state inline.
 *
 * Connector consent is read-only from here now, not a local toggle: this
 * screen just reflects whatever `Connectors` last decided
 * (`connectorStatus()` on mount) and passes that straight through as
 * `connector_mode` — the actual grant/revoke lever moved to
 * `ConnectorsScreen.tsx` entirely, so there is exactly one place that
 * mutates consent, not two that could disagree.
 *
 * Task 12.8 adds writing-assist modes, ported from mobile's own
 * `ChatScreen.tsx` (task 1.4): `modeId` state derives each turn's
 * `connector_mode`/`temperature`/system-prompt-and-history handling in
 * `send()`, mirroring mobile's own logic field-for-field — see `./modes.ts`.
 */

type Status = 'loading' | 'no-model' | 'ready' | 'busy';

type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  connector?: string;
};

let nextId = 0;
function newId(): string {
  nextId += 1;
  return `m${nextId}`;
}

export function ChatScreen({
  onNavigate,
}: {
  onNavigate: (destination: 'models' | 'connectors') => void;
}) {
  const theme = useTheme();
  const [status, setStatus] = useState<Status>('loading');
  const [models, setModels] = useState<ManagedModel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeModelName, setActiveModelName] = useState<string | null>(null);
  const [activeModelParamsB, setActiveModelParamsB] = useState<number | null>(
    null,
  );
  const [connectorName, setConnectorName] = useState<string | null>(null);
  const [connectorGranted, setConnectorGranted] = useState(false);
  const [modeId, setModeId] = useState<ModeId>(DEFAULT_MODE_ID);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Plain `<textarea>` doesn't grow with its content on its own — measuring
  // `scrollHeight` and writing it back is the standard way to fake that.
  // `height: auto` first, or `scrollHeight` would only ever report a value
  // at least as tall as whatever height was already set, never shrink back
  // down after deleting a line. The CSS `max-height` (three lines' worth)
  // still caps this and switches to an internal scrollbar past it.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // Shared between the initial mount fetch and `selectModel`'s post-switch
  // refresh, mirroring `ModelsScreen.tsx`'s own `activate()` → `refresh()`
  // pattern: `loadModel` alone doesn't tell this screen what's active now,
  // so every switch is followed by re-reading the same two calls the mount
  // effect makes, not by trusting the id just requested actually stuck.
  async function refreshModelState() {
    const [freshModels, active] = await Promise.all([
      listModels(),
      activeModelId(),
    ]);
    setModels(freshModels);
    setActiveId(active);
    const activeModel = freshModels.find((m) => m.id === active);
    setActiveModelName(activeModel?.name ?? null);
    setActiveModelParamsB(activeModel?.parametersB ?? null);
    setStatus(active ? 'ready' : 'no-model');
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [connector] = await Promise.all([
        connectorStatus().catch(() => null),
        refreshModelState(),
      ]);
      if (cancelled) return;
      if (connector) {
        setConnectorName(connector.name);
        setConnectorGranted(connector.granted);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function selectModel(id: string) {
    if (id === activeId) return;
    await loadModel(id);
    await refreshModelState();
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || status !== 'ready') return;

    // Mode's system prompt is prepended fresh each turn, not stored in
    // `messages` state, so switching modes takes effect on the next reply
    // instead of leaving a stale instruction in the history — mirrors
    // mobile's own `send()` exactly.
    const mode = findMode(modeId);
    const history: ChatMessage[] = [
      ...(mode.systemPrompt
        ? [{ role: 'system' as const, content: mode.systemPrompt }]
        : []),
      ...(mode.usesHistory
        ? messages.map((m) => ({ role: m.role, content: m.content }))
        : []),
      { role: 'user' as const, content: text },
    ];

    const userId = newId();
    const assistantId = newId();
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ]);
    setDraft('');
    setStatus('busy');

    const unlisten = await onGenerateToken((token) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + token } : m,
        ),
      );
    });

    try {
      // Transform modes (brainstorm/grammar/tone/draft) are not
      // conversations, so offering them a connector is a category error
      // regardless of grant state — 'off' for all of them. Search forces
      // 'required'. Plain chat keeps today's existing behavior, gated on
      // whether the connector is actually granted.
      const connector_mode =
        modeId === 'search'
          ? 'required'
          : modeId === 'plain'
            ? connectorGranted
              ? 'auto'
              : 'off'
            : 'off';
      const result = await generateChat({
        messages: history,
        connector_mode,
        temperature: mode.temperature,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: result.text,
                streaming: false,
                connector: result.connector ?? undefined,
              }
            : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: 'That reply could not be generated.',
                streaming: false,
              }
            : m,
        ),
      );
    } finally {
      await unlisten();
      setStatus('ready');
    }
  }

  async function stop() {
    await cancelGeneration();
  }

  const activeMode = findMode(modeId);
  // A measured limitation of the loaded model, not a general disclaimer
  // about AI — mirrors mobile's own `OfflineBanner` risk branch. Appears
  // only for the mode and the sizes where fabrication was actually
  // observed (mobile's task 1.4 measurement), so it stays worth reading.
  const risky =
    activeMode.cautionBelowB !== null &&
    activeModelParamsB !== null &&
    activeModelParamsB < activeMode.cautionBelowB;

  const hasMessages = messages.length > 0;

  const modelConnectorRow = (
    <div style={{ display: 'flex', gap: theme.space[2] }}>
      <ModelPicker
        models={models}
        activeId={activeId}
        activeModelName={activeModelName}
        onSelect={(id) => void selectModel(id)}
        onMore={() => onNavigate('models')}
      />
      <Button
        label={
          connectorName
            ? `${connectorName}: ${connectorGranted ? 'On' : 'Off'}`
            : 'Connectors'
        }
        variant="ghost"
        size="sm"
        onClick={() => onNavigate('connectors')}
      />
    </div>
  );

  const riskyBanner = risky && (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.space[2],
        padding: theme.space[2],
        borderRadius: theme.radius.md,
        background: theme.colors.warningSurface,
        border: `1px solid ${theme.colors.warningBorder}`,
      }}
    >
      <Icon
        name="alert-triangle"
        size="sm"
        color={theme.colors.warningText}
        aria-hidden
      />
      <p
        style={{
          color: theme.colors.warningText,
          fontSize: theme.fontSize.sm,
          margin: 0,
          flex: 1,
        }}
      >
        {activeModelName} is small enough to invent details that were not in
        your notes — it has produced figures nobody typed. Check any draft
        before sending it, or switch to a larger model in Models.
      </p>
      <Button
        label="Switch model"
        variant="ghost"
        size="sm"
        onClick={() => onNavigate('models')}
      />
    </div>
  );

  const composerPlaceholder =
    status === 'ready' ? 'Ask anything…' : 'Choose a model first';
  const composerDisabled = status !== 'ready' && status !== 'busy';

  function handleComposerKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  // Same `ComposerButton` either way (send while idle, stop while busy) —
  // a plain element, not an inline-defined component, so reusing it below
  // doesn't risk the remount-on-every-keystroke bug a fresh
  // `function ComposerButton()` identity each render would have. Safe
  // because only one of `composer`/`homeComposer` below ever mounts it.
  const sendOrStopButton =
    status === 'busy' ? (
      <ComposerButton
        icon="square"
        label="Stop"
        variant="secondary"
        onClick={() => void stop()}
      />
    ) : (
      <ComposerButton
        icon="send"
        label="Send"
        variant="primary"
        onClick={() => void send()}
        disabled={status !== 'ready' || draft.trim().length === 0}
      />
    );

  // The pinned-footer composer (in-conversation) — side-by-side textarea
  // and send button, unchanged from before this task.
  const composer = (
    <div className={styles.composer}>
      <div className={styles.textareaWrap}>
        <label htmlFor="chat-message" className={styles.textareaLabel}>
          Message
        </label>
        <textarea
          id="chat-message"
          ref={textareaRef}
          className={styles.textarea}
          rows={1}
          placeholder={composerPlaceholder}
          value={draft}
          disabled={composerDisabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleComposerKeyDown}
        />
      </div>
      {sendOrStopButton}
    </div>
  );

  // The home state's own composer — a stacked card (textarea, then a
  // control row) matching the reference product's entry-screen input,
  // with the model/connector indicators moved inside it instead of
  // sitting in a separate row above the card. Genuinely different shape
  // from `composer` above, not the same markup in a different wrapper —
  // kept as its own element rather than forced into one shared shape.
  const homeComposer = (
    <div className={styles.composerCard}>
      <label htmlFor="chat-message" className={styles.srOnly}>
        Message
      </label>
      <textarea
        id="chat-message"
        ref={textareaRef}
        className={styles.homeTextarea}
        rows={1}
        placeholder={composerPlaceholder}
        value={draft}
        disabled={composerDisabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleComposerKeyDown}
      />
      <div className={styles.homeControls}>
        {modelConnectorRow}
        {sendOrStopButton}
      </div>
    </div>
  );

  return (
    <div
      style={{
        background: theme.colors.surface,
        color: theme.colors.textPrimary,
        minHeight: '100vh',
        fontFamily: theme.fontFamily.body,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {hasMessages ? (
        <>
          <header
            style={{
              padding: theme.space[4],
              borderBottom: `1px solid ${theme.colors.border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: theme.space[2],
            }}
          >
            <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>
              Sovereign Edge
            </h1>
            <p
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.sm,
                margin: 0,
              }}
            >
              On-device — nothing you type here leaves this machine unless a
              connector is granted and used.
              {modeId !== DEFAULT_MODE_ID ? ` · ${activeMode.banner}` : ''}
            </p>
            {riskyBanner}
            {modelConnectorRow}
          </header>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: theme.space[4],
            }}
          >
            {messages.map((m) => (
              <ChatBubble
                key={m.id}
                role={m.role}
                text={m.content}
                streaming={m.streaming}
                connector={m.connector}
              />
            ))}
          </div>

          <ModeBar active={modeId} onSelect={setModeId} />

          <footer
            style={{
              padding: theme.space[4],
              borderTop: `1px solid ${theme.colors.border}`,
            }}
          >
            {composer}
          </footer>
        </>
      ) : (
        <div className={styles.home}>
          <div className={styles.homeHeading}>
            <h1 style={{ fontSize: theme.fontSize['2xl'], margin: 0 }}>
              Sovereign Edge
            </h1>
            <p
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSize.sm,
                margin: 0,
              }}
            >
              On-device — nothing you type here leaves this machine unless a
              connector is granted and used.
              {modeId !== DEFAULT_MODE_ID ? ` · ${activeMode.banner}` : ''}
            </p>
          </div>

          {riskyBanner}

          <div className={styles.homeComposerWrap}>{homeComposer}</div>

          <ModeBar active={modeId} onSelect={setModeId} variant="centered" />
        </div>
      )}
    </div>
  );
}

function ComposerButton({
  icon,
  label,
  variant,
  onClick,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  variant: 'primary' | 'secondary';
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={[
        styles.composerButton,
        variant === 'primary'
          ? styles.composerButtonPrimary
          : styles.composerButtonSecondary,
      ].join(' ')}
    >
      {/* `color` is left unset — the button's own CSS sets `color`, and
          `Icon` defaults to `currentColor`, so the icon always matches the
          button's text colour for both variants without saying so twice. */}
      <Icon name={icon} size="sm" aria-hidden />
    </button>
  );
}

/**
 * The composer's own model switcher — lists installed models and switches
 * the active one in place via `loadModel` (the same command
 * `ModelsScreen.tsx`'s own "activate" row uses), plus a "More models" row
 * that hands off to that full screen instead of duplicating its
 * install/remove/fit-badge UI here. Uncatalogued/not-yet-installed models
 * are filtered out — this menu is for switching between what's already on
 * disk, not for installing, which stays `ModelsScreen.tsx`'s job.
 *
 * A module-level component (not defined inside `ChatScreen`'s render body)
 * so its identity stays stable across `ChatScreen` re-renders — the same
 * reason `ComposerButton` above is written this way.
 */
function ModelPicker({
  models,
  activeId,
  activeModelName,
  onSelect,
  onMore,
}: {
  models: ManagedModel[];
  activeId: string | null;
  activeModelName: string | null;
  onSelect: (id: string) => void;
  onMore: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const installed = models.filter((m) => m.installed);

  return (
    <div ref={containerRef} className={styles.modelPicker}>
      <Button
        label={activeModelName ?? 'Choose a model'}
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className={styles.modelMenu} role="group" aria-label="Models">
          {installed.length === 0 ? (
            <p className={styles.modelMenuEmpty}>No models installed yet.</p>
          ) : (
            installed.map((m) => {
              const selected = m.id === activeId;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={selected}
                  className={styles.modelMenuItem}
                  onClick={() => {
                    setOpen(false);
                    onSelect(m.id);
                  }}
                >
                  <span>{m.name}</span>
                  {selected && (
                    <Icon
                      name="check"
                      size="xs"
                      color={theme.colors.accent}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })
          )}
          <div className={styles.modelMenuDivider} />
          <button
            type="button"
            aria-label="More models"
            className={styles.modelMenuItem}
            onClick={() => {
              setOpen(false);
              onMore();
            }}
          >
            <span>More models</span>
            <Icon name="chevron-right" size="xs" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
