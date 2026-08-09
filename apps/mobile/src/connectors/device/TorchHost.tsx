import { Camera, CameraView } from 'expo-camera';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { setPermissionGrantedListener, setTorchController } from './torchBridge';

/**
 * Mounted once at the app root (see `App.tsx`), always — not gated on this
 * connector's own grant state, only on OS camera permission (see below).
 *
 * A `<CameraView>` mounted without camera permission granted starts no
 * capture session (no hardware/battery cost), so it would be safe to
 * render one unconditionally for anyone who never grants this connector —
 * but real-device verification found the opposite direction doesn't work:
 * a `<CameraView>` mounted *before* permission exists does not
 * retroactively start its session once permission is granted later, so
 * the very first grant silently did nothing. Fixed by only ever rendering
 * `<CameraView>` once permission is known granted — checked once on
 * mount (covers a connector granted in an earlier app session) and
 * updated via `torchBridge`'s permission-granted notification (covers
 * granting it for the first time in this session, right as `setTorch`'s
 * `ensureCameraAccess()` call resolves).
 */
export function TorchHost() {
  const [torchOn, setTorchOn] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Camera.getCameraPermissionsAsync().then((result) => {
      if (!cancelled && result.status === 'granted') {
        setHasPermission(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setTorchController({ setTorch: setTorchOn });
    setPermissionGrantedListener(() => setHasPermission(true));
    return () => {
      setTorchController(null);
      setPermissionGrantedListener(null);
    };
  }, []);

  if (!hasPermission) {
    return null;
  }

  return (
    <CameraView
      style={styles.hidden}
      facing="back"
      enableTorch={torchOn}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
