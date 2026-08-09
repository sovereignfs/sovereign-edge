import * as Brightness from 'expo-brightness';

import type { NativeHandler } from '../runtime/nativeHandlers';

/**
 * The Device connector's native handler (task 11.1) — a single plain
 * async function, same shape as `device.info` and Calendar's own
 * handlers, since `expo-brightness`'s app-window-scoped functions
 * (`getBrightnessAsync`/`setBrightnessAsync`) need neither a live
 * `<CameraView>`-style UI presence nor an OS permission request (see
 * `manifest.ts`'s own doc comment).
 */
export const setBrightness: NativeHandler = async (args) => {
  const raw = args.value;
  if (raw !== undefined) {
    if (typeof raw !== 'number' || Number.isNaN(raw) || raw < 0 || raw > 1) {
      return {
        ok: false,
        reason: 'invalid-arguments',
        detail: 'value must be a number between 0 and 1.',
      };
    }
    try {
      await Brightness.setBrightnessAsync(raw);
    } catch (error) {
      return {
        ok: false,
        reason: 'handler-error',
        detail:
          error instanceof Error ? error.message : 'Could not set brightness.',
      };
    }
  }

  try {
    const current = await Brightness.getBrightnessAsync();
    return { ok: true, text: `Brightness is now ${current.toFixed(2)}.` };
  } catch (error) {
    return {
      ok: false,
      reason: 'handler-error',
      detail:
        error instanceof Error ? error.message : 'Could not read brightness.',
    };
  }
};
