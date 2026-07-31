export { CURATED_MODELS, findInCatalog, type CatalogEntry } from './catalog';
export {
  estimatePeakBytes,
  fitForDevice,
  totalMemoryBytes,
  type Fit,
  type FitAssessment,
} from './device';
export { downloadModel, type DownloadModelOptions } from './download';
export {
  ModelManager,
  type LoadedModelHandle,
  type ManagedModel,
  type ManagerOptions,
} from './manager';
export {
  availableSpaceBytes,
  assertSpaceFor,
  isInstalled,
  listInstalled,
  modelFile,
  modelsDirectory,
  removeModel,
} from './store';
export { hashFile, verifyFile } from './verify';
export {
  ModelError,
  type DownloadPhase,
  type DownloadProgress,
  type InstalledModel,
  type ModelDescriptor,
  type ModelErrorCode,
} from './types';
