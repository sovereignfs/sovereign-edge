import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Thin, typed wrappers around the Tauri commands `src-tauri/src/lib.rs`
 * registers (tasks 12.2–12.7a). Field casing here matches each Rust
 * struct's own `serde` attributes exactly, not a blanket convention —
 * `ManagedModel`/`GenerateChatResponse`/etc. are `#[serde(rename_all =
 * "camelCase")]`, but `GenerateChatRequest` (like the older `GenerateRequest`
 * it sits beside) has no such attribute, so its own fields stay snake_case
 * on the wire. Getting this wrong fails silently (Tauri deserializes
 * `Option`al/defaulted fields as absent rather than erroring), so every
 * shape here was checked against the actual Rust struct, not guessed.
 */

export type Role = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: Role;
  content: string;
};

export type Fit = 'comfortable' | 'tight' | 'unsupported' | 'unknown';

export type FitAssessment = {
  fit: Fit;
  estimatedPeakBytes: number;
  totalMemoryBytes?: number;
  note: string;
};

export type ManagedModel = {
  id: string;
  name: string;
  url: string;
  sizeBytes: number;
  md5?: string;
  sha256?: string;
  quantization?: string;
  parameters: string;
  parametersB: number;
  summary: string;
  installed: boolean;
  fit: FitAssessment;
};

export type EngineInfo = {
  gpu: boolean;
  reasonNoGpu?: string;
  contextSize: number;
  toolCapable: boolean;
};

export type ConnectorMode = 'off' | 'auto' | 'required';

export type GenerateChatResult = {
  text: string;
  connector: string | null;
};

export type ConnectorStatus = {
  id: string;
  name: string;
  granted: boolean;
};

/** Mirrors `CommandError`'s `#[serde(tag = "kind", content = "error")]` shape. */
export type CommandError = {
  kind: 'Model' | 'Inference' | 'Connector' | 'Vault';
  error: unknown;
};

function describeCommandError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    'error' in error
  ) {
    const e = error as CommandError;
    if (typeof e.error === 'object' && e.error !== null) {
      const inner = e.error as Record<string, unknown>;
      if (typeof inner.message === 'string') return inner.message;
      if (typeof inner.reason === 'string') return inner.reason;
    }
    if (typeof e.error === 'string') return e.error;
    return `${e.kind} error`;
  }
  return String(error);
}

/**
 * `ModelError`'s own `code` (e.g. `"cancelled"`, kebab-case per its manual
 * `Serialize` impl in `models/types.rs`) — only present on `kind: 'Model'`
 * errors. Lets a caller tell a deliberate cancel apart from a real failure
 * without string-matching `message`, the way `ModelsScreen.tsx`'s
 * install-cancel handling needs to (task 13.7).
 */
function extractModelErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    'error' in error &&
    (error as CommandError).kind === 'Model'
  ) {
    const inner = (error as CommandError).error;
    if (
      typeof inner === 'object' &&
      inner !== null &&
      typeof (inner as Record<string, unknown>).code === 'string'
    ) {
      return (inner as Record<string, unknown>).code as string;
    }
  }
  return undefined;
}

export class TauriCommandError extends Error {
  readonly code?: string;

  constructor(cause: unknown) {
    super(describeCommandError(cause));
    this.name = 'TauriCommandError';
    this.code = extractModelErrorCode(cause);
  }
}

async function call<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (cause) {
    throw new TauriCommandError(cause);
  }
}

export function listModels(): Promise<ManagedModel[]> {
  return call('list_models');
}

export function activeModelId(): Promise<string | null> {
  return call('active_model_id');
}

export function installModel(id: string): Promise<void> {
  return call('install_model', { id });
}

/** Task 13.7: trips `id`'s in-flight download's cancel switch, if any. */
export function cancelInstall(id: string): Promise<void> {
  return call('cancel_install', { id });
}

export function loadModel(id: string): Promise<EngineInfo> {
  return call('load_model', { id });
}

export function removeModel(id: string): Promise<void> {
  return call('remove_model', { id });
}

export function connectorStatus(): Promise<ConnectorStatus> {
  return call('connector_status');
}

export function setSearchConnectorGranted(
  granted: boolean,
): Promise<ConnectorStatus> {
  return call('set_search_connector_granted', { granted });
}

/** Every connector this app currently knows about — task 13.3's own list. */
export function listConnectors(): Promise<ConnectorStatus[]> {
  return call('list_connectors');
}

export function setConnectorGranted(
  id: string,
  granted: boolean,
): Promise<ConnectorStatus> {
  return call('set_connector_granted', { id, granted });
}

/**
 * Task 13.6's own command: the real Search setup flow, mirroring mobile's
 * `SearchSetupScreen.save()`. `request`'s own fields stay snake_case, like
 * `generateChat`'s `GenerateChatRequest` — the Rust struct has no
 * `#[serde(rename_all = "camelCase")]`, matching this file's own
 * documented per-struct-not-blanket casing convention.
 */
export function setSearchConnectorConfig(request: {
  provider: 'searxng' | 'tavily';
  searxng_url?: string;
  tavily_key?: string;
}): Promise<ConnectorStatus> {
  return call('set_search_connector_config', { request });
}

export function cancelGeneration(): Promise<void> {
  return call('cancel_generation');
}

export function generateChat(request: {
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  connector_mode?: ConnectorMode;
}): Promise<GenerateChatResult> {
  return call('generate_chat', { request });
}

/** Per-token streaming, forwarded by every `generate`/`generate_chat` call. */
export function onGenerateToken(
  handler: (token: string) => void,
): Promise<UnlistenFn> {
  return listen<string>('generate-token', (event) => handler(event.payload));
}

export type DownloadProgress = {
  bytesWritten: number;
  totalBytes?: number;
  fraction?: number;
};

export function onDownloadProgress(
  handler: (progress: DownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>('download-progress', (event) =>
    handler(event.payload),
  );
}

/** Mirrors `models::types::DownloadPhase`'s `#[serde(rename_all = "kebab-case")]`. */
export type DownloadPhase = 'downloading' | 'verifying' | 'done' | 'failed';

export function onDownloadPhase(
  handler: (phase: DownloadPhase) => void,
): Promise<UnlistenFn> {
  return listen<DownloadPhase>('download-phase', (event) =>
    handler(event.payload),
  );
}
