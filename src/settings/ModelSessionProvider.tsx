import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { InferenceEngine, InferenceError } from '@/chat/inference';
import {
  ChatSessionContext,
  type ChatSession,
  type ChatSessionStatus,
} from '@/chat/session/ChatSessionContext';
import { ModelManager, type ManagedModel } from '@/models';

/**
 * Owns the app's single inference engine and model manager.
 *
 * One instance, app-wide. The engine holds a model's weights in memory while
 * loaded, and a second concurrent context is the fastest route to an
 * out-of-memory kill on a phone — so screens share this rather than each
 * constructing their own. It is also what makes deleting a model safe: the
 * manager can release it first, which it cannot do if the chat screen holds a
 * separate engine it knows nothing about.
 *
 * Lives in the app shell rather than in `src/chat/` because it touches
 * `ModelManager`, and through it the downloader — which `src/chat/` may not
 * import.
 */

type ModelSession = {
  models: ManagedModel[];
  refresh(): void;
  remove(id: string): Promise<void>;
  /** Loads a model, replacing whatever is loaded. */
  activate(id: string): Promise<void>;
  activeModelId: string | null;
};

const ModelSessionContext = createContext<ModelSession | null>(null);

const loadingDetail = (name: string) =>
  `Loading ${name}. This takes a few seconds.`;

export function useModelSession(): ModelSession {
  const value = useContext(ModelSessionContext);
  if (!value) {
    throw new Error('useModelSession must be used within ModelSessionProvider');
  }
  return value;
}

export function ModelSessionProvider({ children }: { children: ReactNode }) {
  // Lazy initialisers, not `useRef(new …)`: the latter constructs an engine on
  // every render and throws it away.
  const [engine] = useState(() => new InferenceEngine());
  const [manager] = useState(() => new ModelManager({ engine }));

  // Whichever model the app loads on start, decided once at mount. Held as
  // state so the first render can already say "preparing" — announcing it from
  // the effect instead would mean a setState-driven second render.
  const [bootstrap] = useState<ManagedModel | null>(
    () => manager.list().find((m) => m.installed) ?? null,
  );

  const [models, setModels] = useState<ManagedModel[]>(() => manager.list());
  const [status, setStatus] = useState<ChatSessionStatus>(
    bootstrap ? 'preparing' : 'no-model',
  );
  const [modelName, setModelName] = useState<string | null>(
    bootstrap?.name ?? null,
  );
  // Loading a model measured 8.7s on an iPhone 15 Pro — Metal uploads the
  // weights to GPU memory, where the CPU-only path merely mapped them. The
  // wait is real and has to be stated rather than hidden behind a spinner.
  const [detail, setDetail] = useState<string | null>(
    bootstrap ? loadingDetail(bootstrap.name) : null,
  );
  // Mirrors `manager.activeModelId` as state so the badges on the Models
  // screen re-render when it changes; reading the manager during render would
  // leave the memo below holding a stale id.
  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  const refresh = useCallback(() => setModels(manager.list()), [manager]);

  // The async half of activation. Kept free of any setState before its first
  // await so the mount effect below can call it without cascading a render.
  const load = useCallback(
    async (entry: ManagedModel) => {
      try {
        const path = await manager.prepareSwitch(entry.id);
        await engine.load({ modelPath: path });
        manager.markActive(entry.id);
        setActiveModelId(entry.id);
        setStatus('ready');
        setDetail(null);
      } catch (error) {
        setActiveModelId(null);
        setStatus('error');
        setDetail(
          error instanceof InferenceError
            ? error.message
            : `Could not load ${entry.name}.`,
        );
      }
      refresh();
    },
    [engine, manager, refresh],
  );

  const activate = useCallback(
    async (id: string) => {
      const entry = manager.list().find((m) => m.id === id);
      if (!entry) return;

      setStatus('preparing');
      setModelName(entry.name);
      setDetail(loadingDetail(entry.name));
      await load(entry);
    },
    [load, manager],
  );

  // Load on start so the wait overlaps with the user reading the screen rather
  // than beginning when they first press send.
  //
  // `set-state-in-effect` cannot see through the await: every setState in
  // `load` runs after the native loader has come back, which is the
  // "subscribe to an external system" case the rule explicitly allows. This
  // is the one place the load can be kicked off at mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (bootstrap) void load(bootstrap);
  }, [bootstrap, load]);

  const remove = useCallback(
    async (id: string) => {
      await manager.remove(id);
      if (manager.activeModelId === null && status !== 'no-model') {
        const left = manager.list().filter((m) => m.installed);
        setActiveModelId(null);
        setStatus(left.length === 0 ? 'no-model' : 'ready');
        setModelName(null);
      }
      refresh();
    },
    [manager, refresh, status],
  );

  const generate = useCallback<ChatSession['generate']>(
    async (messages, onToken, signal) => {
      setStatus('busy');
      try {
        return await engine.generate({
          messages,
          onToken,
          signal,
          maxTokens: 512,
        });
      } finally {
        // Back to ready even on failure: the model is still loaded, and
        // leaving the composer disabled would strand the user.
        setStatus((s) => (s === 'busy' ? 'ready' : s));
      }
    },
    [engine],
  );

  const chatSession = useMemo<ChatSession>(
    () => ({ status, modelName, detail, generate }),
    [status, modelName, detail, generate],
  );

  const modelSession = useMemo<ModelSession>(
    () => ({ models, refresh, remove, activate, activeModelId }),
    [models, refresh, remove, activate, activeModelId],
  );

  return (
    <ModelSessionContext.Provider value={modelSession}>
      <ChatSessionContext.Provider value={chatSession}>
        {children}
      </ChatSessionContext.Provider>
    </ModelSessionContext.Provider>
  );
}
