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
import type { ConnectorManifest } from '@/connectors';
import { readSearchConfig } from '@/connectors/search/config';
import {
  TAVILY_MANIFEST,
  buildSearxngManifest,
} from '@/connectors/search/manifest';
import { readInstalledConnectors } from '@/connectors/store/installed';
import {
  ModelError,
  ModelManager,
  type DownloadPhase,
  type ManagedModel,
} from '@/models';

import { generateWithConnectors } from './connectorOrchestration';

/**
 * Every connector currently configured and available to route to (task 3.1,
 * extended by task 5.5's store).
 *
 * Reads `readSearchConfig()`/`readInstalledConnectors()` fresh on every call
 * rather than once at mount — either can change between messages (the user
 * configures Search, or installs a connector from the store, then returns to
 * a chat that was already open), and `generate` only runs at send time, so
 * there is no render in between to pick up a `useState` change. Search is
 * still handled separately (its manifest is rebuilt from config, not
 * persisted) because it has no registry entry to install from; every other
 * connector on the device now comes from `readInstalledConnectors()`, the
 * first time this function has returned more than Search alone.
 */
function installedConnectors(): ConnectorManifest[] {
  const config = readSearchConfig();
  const search: ConnectorManifest[] = config
    ? [
        config.provider === 'searxng'
          ? buildSearxngManifest(config.searxngUrl)
          : TAVILY_MANIFEST,
      ]
    : [];
  return [...search, ...readInstalledConnectors()];
}

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

/**
 * A download in flight, as the Models screen needs to render it.
 *
 * `fraction` is null when the server sends no Content-Length — the UI has to
 * say "downloading" without a percentage rather than invent one.
 */
export type ModelDownload = {
  phase: DownloadPhase;
  fraction: number | null;
  bytesWritten: number;
  totalBytes: number | null;
  /** Set when the download ended badly, already phrased for a user. */
  error: string | null;
};

type ModelSession = {
  models: ManagedModel[];
  refresh(): void;
  remove(id: string): Promise<void>;
  /** Loads a model, replacing whatever is loaded. */
  activate(id: string): Promise<void>;
  activeModelId: string | null;
  /** Downloads and verifies a model, then loads it if nothing else is loaded. */
  install(id: string): Promise<void>;
  /** Aborts an in-flight download, discarding the partial file. */
  cancelInstall(id: string): void;
  /** Keyed by model id; absent means no download has been started. */
  downloads: Record<string, ModelDownload>;
};

/** Exported so screens can be rendered against a stub session in tests. */
export const ModelSessionContext = createContext<ModelSession | null>(null);

export type { ModelSession };

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
  //
  // `preferredModelId` is the user's last choice, not simply the first
  // installed catalog entry. That distinction is task 1.6: without it, someone
  // who switched to a larger model was silently returned to the smaller one on
  // next launch — including, after task 1.4's measurements, back to the model
  // that fabricates in Draft.
  const [bootstrap] = useState<ManagedModel | null>(() => {
    const id = manager.preferredModelId();
    return id ? (manager.list().find((m) => m.id === id) ?? null) : null;
  });

  const [models, setModels] = useState<ManagedModel[]>(() => manager.list());
  const [status, setStatus] = useState<ChatSessionStatus>(
    bootstrap ? 'preparing' : 'no-model',
  );
  const [modelName, setModelName] = useState<string | null>(
    bootstrap?.name ?? null,
  );
  const [modelParametersB, setModelParametersB] = useState<number | null>(
    bootstrap?.parametersB ?? null,
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

  const [downloads, setDownloads] = useState<Record<string, ModelDownload>>({});
  // Abort handles for in-flight downloads. A plain Map rather than state: it is
  // only ever touched from callbacks, and re-rendering on a cancel handle
  // appearing would be pointless churn during a multi-gigabyte transfer.
  const [controllers] = useState(() => new Map<string, AbortController>());

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
      setModelParametersB(entry.parametersB);
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
    if (bootstrap) void load(bootstrap);
  }, [bootstrap, load]);

  const install = useCallback(
    async (id: string) => {
      if (controllers.has(id)) return;

      const controller = new AbortController();
      controllers.set(id, controller);
      setDownloads((prev) => ({
        ...prev,
        [id]: {
          phase: 'downloading',
          fraction: null,
          bytesWritten: 0,
          totalBytes: null,
          error: null,
        },
      }));

      try {
        await manager.install(id, {
          signal: controller.signal,
          onProgress: (p) =>
            setDownloads((prev) => {
              const current = prev[id];
              if (!current) return prev;
              // Only re-render when the whole percent moves. Progress events
              // arrive far faster than that, and a setState per event would
              // re-render every screen under this provider for hundreds of
              // updates across a multi-gigabyte transfer.
              const was =
                current.fraction === null
                  ? -1
                  : Math.floor(current.fraction * 100);
              const now =
                p.fraction === null ? -1 : Math.floor(p.fraction * 100);
              if (was === now && current.bytesWritten !== 0) return prev;
              return {
                ...prev,
                [id]: {
                  ...current,
                  fraction: p.fraction,
                  bytesWritten: p.bytesWritten,
                  totalBytes: p.totalBytes,
                },
              };
            }),
          onPhase: (phase) =>
            setDownloads((prev) => {
              const current = prev[id];
              return current ? { ...prev, [id]: { ...current, phase } } : prev;
            }),
        });

        refresh();
        // Getting to a usable chat is the point of pressing download, so load
        // it straight away — but never steal the engine from a model the user
        // is already talking to.
        if (manager.activeModelId === null) await activate(id);
      } catch (error) {
        const cancelled =
          error instanceof ModelError && error.code === 'cancelled';
        setDownloads((prev) => {
          if (cancelled) {
            // A cancel is not a failure to report back; drop the row entirely
            // so the model reads as simply not installed again.
            const { [id]: _removed, ...rest } = prev;
            return rest;
          }
          const current = prev[id];
          if (!current) return prev;
          return {
            ...prev,
            [id]: {
              ...current,
              phase: 'failed',
              error:
                error instanceof ModelError
                  ? error.message
                  : 'The download failed.',
            },
          };
        });
      } finally {
        controllers.delete(id);
      }
    },
    [activate, controllers, manager, refresh],
  );

  const cancelInstall = useCallback(
    (id: string) => controllers.get(id)?.abort(),
    [controllers],
  );

  const remove = useCallback(
    async (id: string) => {
      await manager.remove(id);
      if (manager.activeModelId === null && status !== 'no-model') {
        const left = manager.list().filter((m) => m.installed);
        setActiveModelId(null);
        setStatus(left.length === 0 ? 'no-model' : 'ready');
        setModelName(null);
        setModelParametersB(null);
      }
      refresh();
    },
    [manager, refresh, status],
  );

  const generate = useCallback<ChatSession['generate']>(
    async ({
      messages,
      onToken,
      signal,
      temperature,
      connectorMode = 'off',
    }) => {
      setStatus('busy');
      try {
        // Writing-assist modes never reach connector code at all, not just
        // an empty-manifest no-op through it — `connectorMode` is chat's own
        // "this is a conversation, not a transform" signal, and 'off' is its
        // default for exactly that reason.
        if (connectorMode !== 'off') {
          return await generateWithConnectors(engine, installedConnectors(), {
            messages,
            onToken,
            signal,
            temperature,
            maxTokens: 512,
            toolChoice: connectorMode,
          });
        }
        const result = await engine.generate({
          messages,
          onToken,
          signal,
          temperature,
          maxTokens: 512,
        });
        return { text: result.text, connector: null };
      } finally {
        // Back to ready even on failure: the model is still loaded, and
        // leaving the composer disabled would strand the user.
        setStatus((s) => (s === 'busy' ? 'ready' : s));
      }
    },
    [engine],
  );

  const chatSession = useMemo<ChatSession>(
    () => ({ status, modelName, modelParametersB, detail, generate }),
    [status, modelName, modelParametersB, detail, generate],
  );

  const modelSession = useMemo<ModelSession>(
    () => ({
      models,
      refresh,
      remove,
      activate,
      activeModelId,
      install,
      cancelInstall,
      downloads,
    }),
    [
      models,
      refresh,
      remove,
      activate,
      activeModelId,
      install,
      cancelInstall,
      downloads,
    ],
  );

  return (
    <ModelSessionContext.Provider value={modelSession}>
      <ChatSessionContext.Provider value={chatSession}>
        {children}
      </ChatSessionContext.Provider>
    </ModelSessionContext.Provider>
  );
}
