import { DownloadTask, File, type DownloadPauseState } from 'expo-file-system';

import {
  assertSpaceFor,
  modelFile,
  partFile,
  resumeFile,
  removeModel,
} from './store';
import {
  ModelError,
  type DownloadPhase,
  type DownloadProgress,
  type ModelDescriptor,
} from './types';
import { verifyFile } from './verify';

/**
 * A download reporting no bytes for this long is treated as dead.
 *
 * There is no lower-level timeout that covers this: a TCP connection can stay
 * open and idle indefinitely, which is how a download appears to be "at 47%"
 * forever. That silent stuck state is the failure the developer hit
 * evaluating OGAM, and the reason epic 0.4 exists.
 */
const DEFAULT_STALL_TIMEOUT_MS = 60_000;
const STALL_CHECK_INTERVAL_MS = 2_000;

export type DownloadModelOptions = {
  onProgress?: (progress: DownloadProgress) => void;
  onPhase?: (phase: DownloadPhase) => void;
  onVerifyProgress?: (bytesHashed: number) => void;
  stallTimeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Also verify SHA-256 after the MD5 check. Costs roughly an hour per 4 GB
   * until native SHA-256 lands — see `verify.ts`. Off by default.
   */
  deepVerify?: boolean;
};

function readResumeState(id: string): DownloadPauseState | null {
  const file = resumeFile(id);
  if (!file.exists) return null;
  try {
    return JSON.parse(file.textSync()) as DownloadPauseState;
  } catch {
    // Corrupt resume state is not worth failing over — discard it and start
    // the download from scratch rather than leaving the user stuck.
    file.delete();
    return null;
  }
}

function writeResumeState(id: string, state: DownloadPauseState): void {
  try {
    resumeFile(id).write(JSON.stringify(state));
  } catch {
    // Losing resume state costs time on the next attempt but is not fatal.
  }
}

function clearResumeState(id: string): void {
  const file = resumeFile(id);
  if (file.exists) file.delete();
}

/**
 * Downloads a model, verifies it, and installs it under its final name.
 *
 * Resumes automatically when a previous attempt left resume state behind, so
 * an interrupted multi-gigabyte download does not restart from zero.
 *
 * Every failure throws a `ModelError` with a specific `code`. The one thing
 * this must never do is hang: see the stall watchdog below.
 */
export async function downloadModel(
  descriptor: ModelDescriptor,
  options: DownloadModelOptions = {},
): Promise<File> {
  const {
    onProgress,
    onPhase,
    onVerifyProgress,
    stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
    signal,
    deepVerify = false,
  } = options;

  const installed = modelFile(descriptor.id);
  if (installed.exists) {
    onPhase?.('done');
    return installed;
  }

  assertSpaceFor(descriptor);

  const destination = partFile(descriptor.id);
  const saved = readResumeState(descriptor.id);
  const task = saved
    ? DownloadTask.fromSavable(saved)
    : File.createDownloadTask(descriptor.url, destination);

  let lastProgressAt = Date.now();
  const subscription = task.addListener('progress', (data) => {
    lastProgressAt = Date.now();
    const total = data.totalBytes > 0 ? data.totalBytes : null;
    onProgress?.({
      bytesWritten: data.bytesWritten,
      totalBytes: total,
      fraction: total ? data.bytesWritten / total : null,
    });
  });

  onPhase?.('downloading');

  /**
   * Watchdog. `downloadAsync()` alone can wait forever on a connection that
   * is open but delivering nothing, so progress is tracked out-of-band and
   * the task is paused (not cancelled) when it goes quiet — pausing keeps the
   * bytes already on disk and lets the next attempt resume.
   */
  let stallTimer: ReturnType<typeof setInterval> | undefined;
  /**
   * Set the instant a stall is detected, before any awaiting happens.
   *
   * This flag exists because of a race found on-device: `pauseAsync()` causes
   * the in-flight `downloadAsync()` to resolve with `null`, and that
   * resolution can win the race below. Without the flag the null is
   * indistinguishable from a transport failure, and the caller is told
   * "network" for what is really a stall — losing both the true cause and the
   * fact that the transfer is resumable.
   */
  let stallDetected = false;
  let stallHandled: Promise<void> | null = null;

  const stallError = () =>
    new ModelError(
      'stalled',
      descriptor.id,
      `No data received for ${Math.round(stallTimeoutMs / 1000)}s. ` +
        `The download was paused and can be resumed.`,
    );

  const handleStall = async (): Promise<void> => {
    clearInterval(stallTimer);
    try {
      await task.pauseAsync();
      writeResumeState(descriptor.id, task.savable());
    } catch {
      // Preserving resume state is best-effort; the stall is reported either
      // way so the caller never sees an unexplained hang.
    }
  };

  const stalled = new Promise<never>((_, reject) => {
    stallTimer = setInterval(() => {
      if (Date.now() - lastProgressAt < stallTimeoutMs) return;
      if (stallDetected) return;
      stallDetected = true;
      stallHandled = handleStall();
      void stallHandled.then(() => reject(stallError()));
    }, STALL_CHECK_INTERVAL_MS);
  });

  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return;
    const onAbort = () => {
      task.cancel();
      // A deliberate cancel discards partial data — unlike a stall, the user
      // is not waiting to resume it.
      removeModel(descriptor.id);
      reject(
        new ModelError('cancelled', descriptor.id, 'Download was cancelled.'),
      );
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    const result = await Promise.race([
      saved ? task.resumeAsync() : task.downloadAsync(),
      stalled,
      aborted,
    ]);

    // A stall may have been detected while `downloadAsync()` was resolving.
    // Waiting on `stallHandled` guarantees resume state is on disk before the
    // caller is told the transfer can be resumed.
    if (stallDetected) {
      await stallHandled;
      throw stallError();
    }

    if (!result) {
      throw new ModelError(
        'network',
        descriptor.id,
        'The download ended without producing a file.',
      );
    }

    clearInterval(stallTimer);
    onPhase?.('verifying');
    await verifyFile(destination, descriptor, {
      deep: deepVerify,
      onProgress: onVerifyProgress,
    });

    await destination.move(installed);
    clearResumeState(descriptor.id);
    onPhase?.('done');
    return installed;
  } catch (error) {
    clearInterval(stallTimer);
    onPhase?.('failed');

    if (error instanceof ModelError) {
      // A file that failed verification is worse than no file: it would sit
      // there looking installed. Remove it, keeping resume state only for
      // failures that are actually resumable.
      if (
        error.code === 'checksum-mismatch' ||
        error.code === 'size-mismatch'
      ) {
        removeModel(descriptor.id);
      }
      throw error;
    }

    throw new ModelError(
      'network',
      descriptor.id,
      `Download failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    clearInterval(stallTimer);
    subscription.remove();
    task.release();
  }
}
