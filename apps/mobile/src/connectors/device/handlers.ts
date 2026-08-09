import * as Brightness from 'expo-brightness';

import { ensureCameraAccess } from '../permissions/cameraAccess';
import type { NativeHandler } from '../runtime/nativeHandlers';
import { getTorchController, notifyCameraPermissionGranted } from './torchBridge';

/**
 * The Device connector's native handlers (tasks 11.1/11.2).
 *
 * `setBrightness` is a plain async function, same shape as `device.info`
 * and Calendar's own handlers, since `expo-brightness`'s app-window-scoped
 * functions (`getBrightnessAsync`/`setBrightnessAsync`) need neither a
 * live `<CameraView>`-style UI presence nor an OS permission request (see
 * `manifest.ts`'s own doc comment).
 *
 * `setTorch` is the first handler in this app that needs both: it requests
 * camera permission itself (mirroring Calendar's own
 * `ensureCalendarAccess`-before-`grant()` shape, but inside the handler
 * rather than the Connectors screen, since a denial here is a per-call
 * outcome, not a one-time setup step — see `torchBridge.ts`'s doc comment
 * for why), then reaches the live `<CameraView>` mounted by `TorchHost.tsx`
 * through `torchBridge`. There is no torch readback API (unlike
 * brightness's `getBrightnessAsync`), so the reported text is optimistic —
 * it reflects what was requested, not a re-read confirmation.
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

export const setTorch: NativeHandler = async (args) => {
  const on = args.on;
  if (typeof on !== 'boolean') {
    return {
      ok: false,
      reason: 'invalid-arguments',
      detail: 'on must be a boolean.',
    };
  }

  const { granted } = await ensureCameraAccess();
  if (!granted) {
    return {
      ok: false,
      reason: 'handler-error',
      detail: 'Camera access was not allowed, so the flashlight cannot be controlled.',
    };
  }
  // Tells `TorchHost` to mount a real `<CameraView>` if it hasn't already —
  // see `torchBridge.ts`'s own doc comment for why this is needed on top
  // of the permission check above.
  notifyCameraPermissionGranted();

  const controller = getTorchController();
  if (!controller) {
    return {
      ok: false,
      reason: 'handler-error',
      detail: 'The flashlight is not available right now.',
    };
  }

  controller.setTorch(on);
  return { ok: true, text: `Flashlight turned ${on ? 'on' : 'off'}.` };
};
