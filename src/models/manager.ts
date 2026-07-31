import { CURATED_MODELS, findInCatalog, type CatalogEntry } from './catalog';
import { fitForDevice, type FitAssessment } from './device';
import { downloadModel, type DownloadModelOptions } from './download';
import { isInstalled, listInstalled, modelFile, removeModel } from './store';
import { ModelError } from './types';

/**
 * A model as presented in the manager UI: what it is, whether it is here, and
 * whether this device can be expected to run it.
 */
export type ManagedModel = CatalogEntry & {
  installed: boolean;
  fit: FitAssessment;
};

/**
 * Anything holding a model open. Injected rather than imported so this module
 * never depends on `src/chat/` — the dependency runs one way, and `models/`
 * stays usable without an inference engine present.
 */
export type LoadedModelHandle = {
  readonly isLoaded: boolean;
  unload(): Promise<void>;
};

export type ManagerOptions = {
  /**
   * The engine, when one exists. Supplied so deleting or switching away from
   * the active model releases it first — deleting a file the engine still has
   * mapped is how you get a crash instead of an error.
   */
  engine?: LoadedModelHandle;
};

export class ModelManager {
  private readonly engine?: LoadedModelHandle;
  /** Which model the engine currently holds, if any. */
  private activeId: string | null = null;

  constructor(options: ManagerOptions = {}) {
    this.engine = options.engine;
  }

  /** The catalog, annotated for this device. */
  list(): ManagedModel[] {
    return CURATED_MODELS.map((entry) => ({
      ...entry,
      installed: isInstalled(entry.id),
      fit: fitForDevice(entry),
    }));
  }

  /** Models on disk, including any no longer in the catalog. */
  listInstalled() {
    return listInstalled();
  }

  get activeModelId(): string | null {
    return this.activeId;
  }

  /**
   * Downloads and verifies a catalog model.
   *
   * Entries without an MD5 need deep verification, which is slow; rather than
   * decide that silently, the caller opts in via `allowSlowVerification`.
   */
  async install(
    id: string,
    options: DownloadModelOptions & { allowSlowVerification?: boolean } = {},
  ): Promise<void> {
    const entry = this.requireEntry(id);
    const { allowSlowVerification = false, ...downloadOptions } = options;

    await downloadModel(entry, {
      ...downloadOptions,
      deepVerify:
        downloadOptions.deepVerify ?? (!entry.md5 && allowSlowVerification),
    });
  }

  /**
   * Deletes a model, releasing it first if the engine has it open.
   *
   * The release is the point: on both platforms the weights are memory-mapped
   * while loaded, and removing the file underneath a live mapping is
   * undefined behaviour rather than a clean failure.
   */
  async remove(id: string): Promise<void> {
    if (this.activeId === id && this.engine?.isLoaded) {
      await this.engine.unload();
      this.activeId = null;
    }
    removeModel(id);
  }

  /**
   * Records which model the engine now holds. Call after a successful load so
   * `remove()` and `switchTo()` know what is live.
   */
  markActive(id: string | null): void {
    this.activeId = id;
  }

  /**
   * Prepares to switch models: releases the current one and returns the path
   * the caller should load. Loading itself stays with the engine, so this
   * module never reaches into `src/chat/`.
   */
  async prepareSwitch(id: string): Promise<string> {
    this.requireEntry(id);

    if (!isInstalled(id)) {
      throw new ModelError(
        'storage',
        id,
        'That model is not installed. Download it before switching to it.',
      );
    }

    if (this.engine?.isLoaded) {
      await this.engine.unload();
    }
    this.activeId = null;

    // llama.rn wants a filesystem path; the store speaks in file:// URIs.
    return modelFile(id).uri.replace(/^file:\/\//, '');
  }

  private requireEntry(id: string): CatalogEntry {
    const entry = findInCatalog(id);
    if (!entry) {
      throw new ModelError('storage', id, `Unknown model: ${id}`);
    }
    return entry;
  }
}
