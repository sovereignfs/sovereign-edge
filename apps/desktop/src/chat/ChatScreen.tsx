import { useEffect, useRef, useState } from 'react';
import {
  Button,
  ChatBubble,
  ListItem,
  TextField,
  Toggle,
  useTheme,
} from 'desktop-ui';
import {
  activeModelId,
  cancelGeneration,
  connectorStatus,
  generateChat,
  installModel,
  listModels,
  loadModel,
  onGenerateToken,
  setSearchConnectorGranted,
  type ChatMessage,
  type ConnectorStatus,
  type ManagedModel,
} from '../lib/tauri';

/**
 * Task 12.7's own scope, per `core-port.md`: "a single chat screen — model
 * selection, message input/output, and the same in-chat connector-
 * provenance marker mobile's task 2.5 established." Mirrors the shape of
 * `apps/mobile/src/chat/screens/ChatScreen.tsx`'s `send()` (streaming via
 * `on_token`, overwrite-from-final-result rather than trust the
 * accumulated stream, connector tag from the result not guessed at) and
 * `apps/mobile/src/models/screens/ModelsScreen.tsx`'s install/load
 * dispatch — folded into one screen rather than two, since desktop has no
 * navigation/settings shell yet (out of this epic's scope) to put a
 * separate Models screen behind.
 */

type ModelStatus =
  'loading-list' | 'no-model' | 'preparing' | 'ready' | 'busy' | 'error';

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

function modelSubtitle(model: ManagedModel): string {
  const size = `${(model.sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${model.parameters} · ${size} · ${model.fit.note}`;
}

export function ChatScreen() {
  const theme = useTheme();
  const [status, setStatus] = useState<ModelStatus>('loading-list');
  const [models, setModels] = useState<ManagedModel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const [connector, setConnector] = useState<ConnectorStatus | null>(null);
  const [connectorEnabled, setConnectorEnabled] = useState(false);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, active, connectorState] = await Promise.all([
        listModels(),
        activeModelId(),
        connectorStatus().catch(() => null),
      ]);
      if (cancelled) return;
      setModels(list);
      setActiveId(active);
      if (connectorState) {
        setConnector(connectorState);
        setConnectorEnabled(connectorState.granted);
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

  async function selectModel(model: ManagedModel) {
    if (status === 'preparing' || status === 'busy') return;
    setModelError(null);
    setPendingModelId(model.id);
    setStatus('preparing');
    try {
      if (!model.installed) {
        await installModel(model.id);
        setModels((prev) =>
          prev.map((m) => (m.id === model.id ? { ...m, installed: true } : m)),
        );
      }
      await loadModel(model.id);
      setActiveId(model.id);
      setStatus('ready');
    } catch (cause) {
      setModelError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    } finally {
      setPendingModelId(null);
    }
  }

  async function toggleConnector(next: boolean) {
    setConnectorEnabled(next);
    try {
      const result = await setSearchConnectorGranted(next);
      setConnector(result);
    } catch {
      // Best-effort: the Toggle already reflects `next`; a failed write
      // just means the next send() reflects the previous grant state
      // instead, discovered from `generate_chat`'s own reply rather than
      // silently pretending the write succeeded.
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || status !== 'ready') return;

    const history: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    history.push({ role: 'user', content: text });

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
      const result = await generateChat({
        messages: history,
        connector_mode: connectorEnabled ? 'auto' : 'off',
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
          On-device — nothing you type here leaves this machine unless the
          Search connector below is on and used.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: theme.space[1],
          }}
        >
          {status === 'loading-list' ? (
            <p style={{ fontSize: theme.fontSize.sm }}>Loading models…</p>
          ) : (
            models.map((model) => (
              <ListItem
                key={model.id}
                title={model.name}
                subtitle={
                  model.id === activeId
                    ? `${modelSubtitle(model)} · Active`
                    : modelSubtitle(model)
                }
                onClick={() => selectModel(model)}
                disabled={status === 'preparing' && pendingModelId !== model.id}
              />
            ))
          )}
          {modelError ? (
            <p
              style={{
                color: theme.colors.errorText,
                fontSize: theme.fontSize.sm,
              }}
            >
              {modelError}
            </p>
          ) : null}
        </div>

        {connector ? (
          <ListItem
            title={connector.name}
            subtitle={
              connectorEnabled
                ? 'Answers may use the network for this connector.'
                : 'Off — every reply comes from the local model only.'
            }
            accessory={
              <Toggle
                value={connectorEnabled}
                onValueChange={toggleConnector}
                aria-label={connector.name}
              />
            }
          />
        ) : null}
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
              : status === 'preparing'
                ? 'Preparing the model…'
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
