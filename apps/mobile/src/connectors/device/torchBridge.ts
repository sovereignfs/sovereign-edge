/**
 * The bridge between the torch handler (task 11.2, a plain async function
 * outside the component tree, per `runtime/nativeHandlers.ts`'s
 * `NativeHandler` type) and `TorchHost.tsx` (a live, mounted
 * `<CameraView>` — the only thing that can actually toggle the flash,
 * since `expo-camera`'s `enableTorch` is a `CameraView` prop, not an
 * imperative function).
 *
 * This is the one genuinely new pattern in this codebase's connector
 * runtime: every other `NativeHandler` (device.info, Calendar's four,
 * brightness) is a pure function with no relationship to anything mounted.
 * Kept intentionally narrow — two single-slot registrations for this one
 * purpose, not a general pub-sub — since nothing else here needs one yet.
 *
 * The permission-granted notification exists because a `<CameraView>`
 * mounted before camera permission is granted does not retroactively start
 * its capture session once permission is later granted elsewhere — found
 * on real hardware (task 11.2's own real-device verification): the first
 * grant reported success but the flash never lit, because `TorchHost` had
 * mounted its `<CameraView>` at app launch, before any permission existed,
 * and nothing told it to reconfigure. `setTorch` (`handlers.ts`) calls
 * `notifyCameraPermissionGranted()` right after `ensureCameraAccess()`
 * resolves `granted: true`, and `TorchHost` only renders a real
 * `<CameraView>` once it has seen permission granted — at mount (already
 * granted from a previous session) or via this notification (granted just
 * now).
 */
export type TorchController = {
  setTorch(on: boolean): void;
};

let controller: TorchController | null = null;

export function setTorchController(next: TorchController | null): void {
  controller = next;
}

export function getTorchController(): TorchController | null {
  return controller;
}

let permissionGrantedListener: (() => void) | null = null;

export function setPermissionGrantedListener(
  next: (() => void) | null,
): void {
  permissionGrantedListener = next;
}

export function notifyCameraPermissionGranted(): void {
  permissionGrantedListener?.();
}
