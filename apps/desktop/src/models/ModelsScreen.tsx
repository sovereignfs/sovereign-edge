import { useEffect, useRef, useState } from 'react';
import {
  FitBadge,
  ListItem,
  ProgressBar,
  SectionLabel,
  useTheme,
  type FitBadgeVariant,
} from 'desktop-ui';
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
 *
 * Task 15.3 brings this up to `reference.html`'s `#dscreen-models` mockup
 * and mobile's own post-7.6 shape: an Installed/Available section split, a
 * real `ProgressBar` during a download, and a colour-coded `FitBadge`
 * replacing the mono-coloured accessory text. The badge now names a
 * *status* (`Too large`, a live percentage, `Verifying`) rather than an
 * action — the "click to X" affordance moved into the subtitle instead,
 * the same restructure mobile's task 7.6 made.
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
  state: { installed: boolean; active: boolean; fit: Fit },
): string {
  const base = `${size} · ${fitNote}`;
  if (state.active) return `${base} · click to remove`;
  if (state.installed) return `${base} · click to use`;
  if (state.fit === 'unsupported') return `${base} · click to download anyway`;
  return base;
}

function subtitleForProgress(
  progress: Progress | undefined,
): string | undefined {
  if (!progress) return undefined;
  switch (progress.phase) {
    case 'downloading': {
      const size =
        progress.totalBytes === undefined
          ? `${(progress.bytesWritten / 1e6).toFixed(0)} MB so far`
          : `${(progress.bytesWritten / 1e9).toFixed(2)} of ${(progress.totalBytes / 1e9).toFixed(2)} GB`;
      return `Downloading · ${size} · click to cancel`;
    }
    case 'verifying':
      return 'Checking the file matches the publisher’s checksum.';
    case 'failed':
      return progress.error ?? 'The download failed. Click to try again.';
    case 'done':
      return undefined;
  }
}

/** Fit maps to badge colour the same way everywhere it's shown — same
 * mapping as mobile's own `variantFor` (task 7.6). */
function variantFor(fit: Fit): FitBadgeVariant {
  switch (fit) {
    case 'comfortable':
      return 'good';
    case 'tight':
      return 'tight';
    case 'unsupported':
      return 'bad';
    case 'unknown':
      return 'neutral';
  }
}

function Badge({
  installed,
  active,
  progress,
  fit,
}: {
  installed: boolean;
  active: boolean;
  progress: Progress | undefined;
  fit: Fit;
}) {
  if (progress?.phase === 'downloading') {
    const pct =
      progress.fraction === undefined
        ? null
        : `${Math.floor(progress.fraction * 100)}%`;
    return <FitBadge label={pct ?? '…'} variant="tight" />;
  }
  if (progress?.phase === 'verifying') {
    return <FitBadge label="Verifying" variant="tight" />;
  }
  if (progress?.phase === 'failed') {
    return <FitBadge label="Retry" variant="bad" />;
  }
  if (!installed) {
    if (fit === 'unsupported') {
      return <FitBadge label="Too large" variant="bad" />;
    }
    return <FitBadge label="Download" variant={variantFor(fit)} />;
  }
  return (
    <FitBadge label={active ? 'In use' : 'Installed'} variant={variantFor(fit)} />
  );
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

  function row(model: ManagedModel) {
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
            fit: model.fit.fit,
          })
        }
        footer={
          progress?.phase === 'downloading' ? (
            <ProgressBar progress={progress.fraction ?? 0} />
          ) : undefined
        }
        accessory={
          <Badge
            installed={model.installed}
            active={active}
            progress={progress}
            fit={model.fit.fit}
          />
        }
        onClick={rowAction(model)}
        destructive={progress?.phase === 'failed'}
      />
    );
  }

  const installed = models.filter((m) => m.installed);
  const available = models.filter((m) => !m.installed);

  return (
    <div>
      <div style={{ padding: theme.space[4] }}>
        <h1 style={{ fontSize: theme.fontSize.lg, margin: 0 }}>Models</h1>
        <p
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSize.sm,
            margin: `${theme.space[2]}px 0 0`,
          }}
        >
          Models run entirely on this device. Larger ones answer better and
          need more memory.
        </p>
      </div>

      {loading ? (
        <p style={{ fontSize: theme.fontSize.sm, padding: `0 ${theme.space[4]}px` }}>
          Loading models…
        </p>
      ) : (
        <>
          {installed.length > 0 ? (
            <>
              <SectionLabel>Installed</SectionLabel>
              {installed.map(row)}
            </>
          ) : null}
          {available.length > 0 ? (
            <>
              <SectionLabel>Available</SectionLabel>
              {available.map(row)}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
