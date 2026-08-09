import { useEffect, useRef, useState } from 'react';
import { Button, ChatBubble, TextField, useTheme } from 'desktop-ui';
import {
  activeModelId,
  cancelGeneration,
  connectorStatus,
  generateChat,
  listModels,
  onGenerateToken,
  type ChatMessage,
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [models, active, connector] = await Promise.all([
        listModels(),
        activeModelId(),
        connectorStatus().catch(() => null),
      ]);
      if (cancelled) return;
      const activeModel = models.find((m) => m.id === active);
      setActiveModelName(activeModel?.name ?? null);
      setActiveModelParamsB(activeModel?.parametersB ?? null);
      if (connector) {
        setConnectorName(connector.name);
        setConnectorGranted(connector.granted);
      }
      setStatus(active ? 'ready' : 'no-model');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

        {risky && (
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
            <p
              style={{
                color: theme.colors.warningText,
                fontSize: theme.fontSize.sm,
                margin: 0,
                flex: 1,
              }}
            >
              {activeModelName} is small enough to invent details that were not
              in your notes — it has produced figures nobody typed. Check any
              draft before sending it, or switch to a larger model in Models.
            </p>
            <Button
              label="Switch model"
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('models')}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: theme.space[2] }}>
          <Button
            label={
              activeModelName ? `Model: ${activeModelName}` : 'Choose a model'
            }
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('models')}
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
      </header>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: theme.space[4],
        }}
      >
        {messages.length === 0 ? (
          <p
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSize.sm,
            }}
          >
            {status === 'no-model'
              ? 'Choose a model above to start.'
              : status === 'loading'
                ? 'Loading…'
                : 'Say something.'}
          </p>
        ) : (
          messages.map((m) => (
            <ChatBubble
              key={m.id}
              role={m.role}
              text={m.content}
              streaming={m.streaming}
              connector={m.connector}
            />
          ))
        )}
      </div>

      <ModeBar active={modeId} onSelect={setModeId} />

      <footer
        style={{
          padding: theme.space[4],
          borderTop: `1px solid ${theme.colors.border}`,
          display: 'flex',
          gap: theme.space[2],
        }}
      >
        <div style={{ flex: 1 }}>
          <TextField
            label="Message"
            placeholder={
              status === 'ready' ? 'Ask anything…' : 'Choose a model first'
            }
            value={draft}
            disabled={status !== 'ready' && status !== 'busy'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
        </div>
        {status === 'busy' ? (
          <Button
            label="Stop"
            variant="secondary"
            onClick={() => void stop()}
          />
        ) : (
          <Button
            label="Send"
            variant="primary"
            onClick={() => void send()}
            disabled={status !== 'ready' || draft.trim().length === 0}
          />
        )}
      </footer>
    </div>
  );
}
