import { Directory, File, Paths } from 'expo-file-system';

import { ModelError, type InstalledModel, type ModelDescriptor } from './types';

const MODELS_DIRNAME = 'models';
const MODEL_EXT = '.gguf';
/** In-flight downloads carry this suffix so a partial file is never mistaken
 *  for a usable model — the rename to the final name is the commit point. */
const PART_EXT = '.part';
const RESUME_EXT = '.resume.json';

/**
 * Models live under the document directory, not the cache directory: the OS
 * may evict cache contents under storage pressure, and silently losing a
 * multi-gigabyte download the user waited for is exactly the failure this
 * pipeline exists to avoid.
 */
export function modelsDirectory(): Directory {
  const dir = new Directory(Paths.document, MODELS_DIRNAME);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export function modelFile(id: string): File {
  return new File(modelsDirectory(), `${id}${MODEL_EXT}`);
}

export function partFile(id: string): File {
  return new File(modelsDirectory(), `${id}${MODEL_EXT}${PART_EXT}`);
}

export function resumeFile(id: string): File {
  return new File(modelsDirectory(), `${id}${RESUME_EXT}`);
}

export function isInstalled(id: string): boolean {
  return modelFile(id).exists;
}

/** Every complete model on disk. Partial and resume files are excluded. */
export function listInstalled(): InstalledModel[] {
  const dir = modelsDirectory();
  const entries = dir.exists ? dir.list() : [];

  return entries
    .filter((entry): entry is File => entry instanceof File)
    .filter((file) => file.name.endsWith(MODEL_EXT))
    .map((file) => ({
      id: file.name.slice(0, -MODEL_EXT.length),
      uri: file.uri,
      sizeBytes: file.size ?? 0,
      complete: true,
    }));
}

/**
 * Deletes a model and any partial download or resume state for it, so a
 * "delete to reclaim space" action actually reclaims all of it.
 */
export function removeModel(id: string): void {
  for (const file of [modelFile(id), partFile(id), resumeFile(id)]) {
    if (file.exists) {
      try {
        file.delete();
      } catch (cause) {
        throw new ModelError('storage', id, `Could not delete ${file.name}.`, {
          cause,
        });
      }
    }
  }
}

/**
 * Which model the user last chose, so the choice survives a relaunch.
 *
 * Kept beside the model files rather than in a settings store because it is
 * only meaningful while that file exists — deleting the model should not
 * leave a preference pointing at nothing, and both are reclaimed together.
 *
 * The stored id is a hint, not a guarantee: `readActiveModelId` returns null
 * once the file it names is gone, so a model deleted outside the app (or by
 * an OS clean-up) degrades to the same behaviour as a first launch instead of
 * failing to start.
 */
const ACTIVE_FILENAME = 'active-model.json';

function activeFile(): File {
  return new File(modelsDirectory(), ACTIVE_FILENAME);
}

export function readActiveModelId(): string | null {
  const file = activeFile();
  if (!file.exists) return null;

  try {
    const { id } = JSON.parse(file.textSync()) as { id?: unknown };
    if (typeof id !== 'string' || !isInstalled(id)) return null;
    return id;
  } catch {
    // Corrupt state is not worth failing a launch over. Fall back to the
    // "first installed" default, which is always safe.
    return null;
  }
}

export function writeActiveModelId(id: string | null): void {
  const file = activeFile();
  try {
    if (id === null) {
      if (file.exists) file.delete();
      return;
    }
    file.write(JSON.stringify({ id }));
  } catch {
    // Losing the preference costs one wrong model on next launch, which the
    // user can correct. Failing the switch they just asked for is worse.
  }
}

export function availableSpaceBytes(): number {
  return Paths.availableDiskSpace;
}

/**
 * Fails before starting rather than part-way through a long download.
 *
 * The headroom accounts for the verification step, which reads the file but
 * writes nothing, and for the OS needing room to operate — filling a device
 * completely is its own failure mode.
 */
export function assertSpaceFor(
  descriptor: ModelDescriptor,
  headroomBytes = 256 * 1024 * 1024,
): void {
  const available = availableSpaceBytes();
  const needed = descriptor.sizeBytes + headroomBytes;

  if (available < needed) {
    const gb = (n: number) => (n / 1e9).toFixed(1);
    throw new ModelError(
      'insufficient-space',
      descriptor.id,
      `Needs ${gb(needed)} GB free (model ${gb(descriptor.sizeBytes)} GB ` +
        `plus working room) but only ${gb(available)} GB is available.`,
    );
  }
}
