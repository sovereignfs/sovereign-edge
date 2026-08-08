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
  const [connectorName, setConnectorName] = useState<string | null>(null);
  const [connectorGranted, setConnectorGranted] = useState(false);

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
      setActiveModelName(models.find((m) => m.id === active)?.name ?? null);
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
        connector_mode: connectorGranted ? 'auto' : 'off',
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
          On-device — nothing you type here leaves this machine unless a
          connector is granted and used.
        </p>

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
