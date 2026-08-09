import { useEffect, useRef, useState } from 'react';
import { ListItem, useTheme } from 'desktop-ui';
import {
  activeModelId,
  cancelInstall,
  installModel,
  listModels,
  loadModel,
  onDownloadPhase,
  onDownloadProgress,
  removeModel,
  TauriCommandError,
  type DownloadPhase,
  type DownloadProgress,
  type Fit,
  type ManagedModel,
} from '../lib/tauri';

/**
 * Task 13.2's own scope: the real model manager, mirroring
 * `apps/mobile/src/models/screens/ModelsScreen.tsx` — same tap dispatch
 * (not installed → install; installed and active → remove; installed and
 * not active → activate), same "the subtitle says in words what tapping
 * will do" rule, same accessory label set, same `destructive` styling on a
 * failed download. `ChatScreen.tsx` keeps its own inline model picker for
 * now — task 13.5 removes it once this screen is the real thing.
 *
 * Task 13.7 closes the one gap 13.2 shipped with: a downloading/verifying
 * row is now clickable and cancels the transfer, mirroring mobile's own
 * "tapping a live download cancels it" behavior exactly, including the
 * `CANCEL` accessory label and "tap to cancel" subtitle suffix.
 */

type Progress = {
  phase: DownloadPhase;
  bytesWritten: number;
  totalBytes?: number;
  fraction?: number;
  error?: string;
};

function gb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

function idleSubtitle(
  size: string,
  fitNote: string,
  state: { installed: boolean; active: boolean },
): string {
  const base = `${size} · ${fitNote}`;
  if (state.active) return `${base} · click to remove`;
  if (state.installed) return `${base} · click to use`;
  return base;
}

function subtitleForProgress(
  progress: Progress | undefined,
): string | undefined {
  if (!progress) return undefined;
  switch (progress.phase) {
    case 'downloading': {
      const pct =
        progress.fraction === undefined
          ? null
          : `${Math.floor(progress.fraction * 100)}%`;
      const size =
        progress.totalBytes === undefined
          ? `${(progress.bytesWritten / 1e6).toFixed(0)} MB so far`
          : `${(progress.bytesWritten / 1e9).toFixed(2)} of ${(progress.totalBytes / 1e9).toFixed(2)} GB`;
      return pct
        ? `Downloading ${pct} · ${size} · tap to cancel`
        : `Downloading · ${size} · tap to cancel`;
    }
    case 'verifying':
      return 'Checking the file matches the publisher’s checksum.';
    case 'failed':
      return progress.error ?? 'The download failed. Click to try again.';
    case 'done':
      return undefined;
  }
}

function accessoryLabel(
  installed: boolean,
  active: boolean,
  progress: Progress | undefined,
  fit: Fit,
): string {
  if (progress?.phase === 'downloading' || progress?.phase === 'verifying') {
    return 'CANCEL';
  }
  if (progress?.phase === 'failed') return 'RETRY';
  if (!installed) return fit === 'unsupported' ? 'DOWNLOAD ANYWAY' : 'DOWNLOAD';
  return active ? 'IN USE' : 'INSTALLED';
}

function accessoryColor(
  theme: ReturnType<typeof useTheme>,
  installed: boolean,
  active: boolean,
  progress: Progress | undefined,
  fit: Fit,
): string {
  if (progress?.phase === 'failed') return theme.colors.errorText;
  if (active) return theme.colors.successText;
  if (!installed) {
    return fit === 'unsupported' ? theme.colors.textMuted : theme.colors.accent;
  }
  return theme.colors.textMuted;
}

export function ModelsScreen() {
  const theme = useTheme();
  const [models, setModels] = useState<ManagedModel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [progressById, setProgressById] = useState<Record<string, Progress>>(
    {},
  );
  const installingIdRef = useRef<string | null>(null);

  async function refresh() {
    const [list, active] = await Promise.all([listModels(), activeModelId()]);
    setModels(list);
    setActiveId(active);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();

    const unlistenProgress = onDownloadProgress(
      (progress: DownloadProgress) => {
        const id = installingIdRef.current;
        if (!id) return;
        setProgressById((prev) => ({
          ...prev,
          [id]: {
            phase: 'downloading',
            bytesWritten: progress.bytesWritten,
            totalBytes: progress.totalBytes,
            fraction: progress.fraction,
          },
        }));
      },
    );

    const unlistenPhase = onDownloadPhase((phase) => {
      const id = installingIdRef.current;
      if (!id) return;
      if (phase === 'done') return; // install()'s own resolution handles this
      setProgressById((prev) => ({
        ...prev,
        [id]: { ...prev[id], phase, bytesWritten: prev[id]?.bytesWritten ?? 0 },
      }));
    });

    return () => {
      cancelled = true;
      void unlistenProgress.then((f) => f());
      void unlistenPhase.then((f) => f());
    };
  }, []);

  async function install(id: string) {
    installingIdRef.current = id;
    setInstallingId(id);
    setProgressById((prev) => ({
      ...prev,
      [id]: { phase: 'downloading', bytesWritten: 0 },
    }));
    try {
      await installModel(id);
      setProgressById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refresh();
    } catch (cause) {
      // A deliberate cancel is not a failure to report back — drop the row
      // entirely, same as a successful install's cleanup, mirroring
      // mobile's `ModelSessionProvider.tsx` handling of `code === 'cancelled'`.
      if (cause instanceof TauriCommandError && cause.code === 'cancelled') {
        setProgressById((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } else {
        setProgressById((prev) => ({
          ...prev,
          [id]: {
            phase: 'failed',
            bytesWritten: prev[id]?.bytesWritten ?? 0,
            error: cause instanceof Error ? cause.message : String(cause),
          },
        }));
      }
    } finally {
      installingIdRef.current = null;
      setInstallingId(null);
    }
  }

  async function activate(id: string) {
    await loadModel(id);
    await refresh();
  }

  async function remove(id: string) {
    await removeModel(id);
    await refresh();
  }

  function rowAction(model: ManagedModel): (() => void) | undefined {
    const progress = progressById[model.id];
    // Tapping a live download cancels it — the only stop control, so it
    // must stay reachable for the whole transfer (mirrors mobile's
    // ModelsScreen.tsx exactly).
    if (progress?.phase === 'downloading' || progress?.phase === 'verifying') {
      return () => void cancelInstall(model.id);
    }
    if (installingId === model.id) return undefined;
    if (!model.installed) return () => void install(model.id);
    return model.id === activeId
      ? () => void remove(model.id)
      : () => void activate(model.id);
  }

  return (
    <div style={{ padding: theme.space[4] }}>
      <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Models</h1>
      <p
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSize.sm,
          margin: `${theme.space[2]}px 0 ${theme.space[3]}px`,
        }}
      >
        Models run entirely on this device. Larger ones answer better and need
        more memory.
      </p>

      {loading ? (
        <p style={{ fontSize: theme.fontSize.sm }}>Loading models…</p>
      ) : (
        models.map((model) => {
          const active = model.id === activeId;
          const progress = progressById[model.id];
          return (
            <ListItem
              key={model.id}
              title={`${model.name} · ${model.parameters}`}
              subtitle={
                subtitleForProgress(progress) ??
                idleSubtitle(gb(model.sizeBytes), model.fit.note, {
                  installed: model.installed,
                  active,
                })
              }
              accessory={
                <span
                  style={{
                    color: accessoryColor(
                      theme,
                      model.installed,
                      active,
                      progress,
                      model.fit.fit,
                    ),
                    fontSize: theme.fontSize.label,
                    fontFamily: theme.fontFamily.mono,
                  }}
                >
                  {accessoryLabel(
                    model.installed,
                    active,
                    progress,
                    model.fit.fit,
                  )}
                </span>
              }
              onClick={rowAction(model)}
              destructive={progress?.phase === 'failed'}
            />
          );
        })
      )}
    </div>
  );
}
