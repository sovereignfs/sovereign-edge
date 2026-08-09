import { Camera } from 'expo-camera';

/**
 * The real OS camera permission, requested once for the torch connector
 * (task 11.2) — same "check status, prompt once if undetermined" shape as
 * `calendarAccess.ts`'s `ensureCalendarAccess`.
 *
 * Torch itself needs no capture, recording, or storage — but iOS/Android
 * both gate `enableTorch` behind the standard camera permission, since a
 * live `<CameraView>` is what actually exposes the flash hardware.
 */
export async function ensureCameraAccess(): Promise<{ granted: boolean }> {
  const current = await Camera.getCameraPermissionsAsync();
  if (current.status === 'granted') {
    return { granted: true };
  }
  const requested = await Camera.requestCameraPermissionsAsync();
  return { granted: requested.status === 'granted' };
}
