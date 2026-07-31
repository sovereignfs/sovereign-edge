import * as Device from 'expo-device';

import type { CatalogEntry } from './catalog';

/**
 * How well a model is expected to run on this device.
 *
 * These are estimates, and the honest reason they are estimates is that no
 * API here reports *available* memory. `expo-device` exposes `totalMemory`
 * only, so the budget below is a fraction of total rather than a measurement
 * of what is actually free. A device with plenty of RAM but a browser and a
 * dozen background apps open will do worse than 'comfortable' suggests.
 */
export type Fit = 'comfortable' | 'tight' | 'unsupported' | 'unknown';

export type FitAssessment = {
  fit: Fit;
  /** Estimated peak resident memory while the model is loaded, in bytes. */
  estimatedPeakBytes: number;
  /** Total device RAM, or `null` when the platform does not report it. */
  totalMemoryBytes: number | null;
  /** One sentence suitable for showing to a user. */
  note: string;
};

/**
 * Weights are memory-mapped, but the KV cache, compute buffers, and runtime
 * are not, and they scale with context length rather than model size. 15% plus
 * a flat 256 MB approximates a 2048-token context without pretending to be
 * exact — the flat term dominates for small models, which is correct.
 */
const OVERHEAD_RATIO = 1.15;
const RUNTIME_OVERHEAD_BYTES = 256 * 1024 * 1024;

/**
 * Share of total RAM a foreground app can realistically hold before the OS
 * starts killing it. Deliberately conservative: being wrong in the optimistic
 * direction means the app is terminated mid-answer, which is a far worse
 * experience than being told to pick a smaller model.
 */
const USABLE_FRACTION = 0.5;

export function totalMemoryBytes(): number | null {
  return Device.totalMemory ?? null;
}

export function estimatePeakBytes(entry: CatalogEntry): number {
  return Math.round(entry.sizeBytes * OVERHEAD_RATIO + RUNTIME_OVERHEAD_BYTES);
}

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

export function fitForDevice(entry: CatalogEntry): FitAssessment {
  const total = totalMemoryBytes();
  const estimatedPeakBytes = estimatePeakBytes(entry);

  if (total === null) {
    return {
      fit: 'unknown',
      estimatedPeakBytes,
      totalMemoryBytes: null,
      note: `Needs roughly ${gb(estimatedPeakBytes)} GB of memory. This device does not report its total RAM, so this cannot be checked in advance.`,
    };
  }

  const budget = total * USABLE_FRACTION;

  if (estimatedPeakBytes <= budget * 0.7) {
    return {
      fit: 'comfortable',
      estimatedPeakBytes,
      totalMemoryBytes: total,
      note: `Should run comfortably — about ${gb(estimatedPeakBytes)} GB of this device's ${gb(total)} GB.`,
    };
  }

  if (estimatedPeakBytes <= budget) {
    return {
      fit: 'tight',
      estimatedPeakBytes,
      totalMemoryBytes: total,
      note: `Will fit, but close to the limit — about ${gb(estimatedPeakBytes)} GB of ${gb(total)} GB. Close other apps before a long conversation.`,
    };
  }

  return {
    fit: 'unsupported',
    estimatedPeakBytes,
    totalMemoryBytes: total,
    // Says what the budget is, not just the totals. Comparing "needs 2.1 GB"
    // against "has 3.8 GB" reads as a contradiction unless the note explains
    // that an app cannot use all of a device's RAM.
    note: `Likely too large for this device — needs about ${gb(estimatedPeakBytes)} GB, more than the ~${gb(budget)} GB an app can safely use of this device's ${gb(total)} GB. Pick a smaller model.`,
  };
}
