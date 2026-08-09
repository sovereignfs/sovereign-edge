import type { ConnectorManifestTier3 } from '@sovereignfs/connector-sdk';

/**
 * The Device connector's manifest (task 11.1), mirroring
 * `calendar/manifest.ts`'s builder-function style.
 *
 * One tool, not two: `value` is optional, so "read the current
 * brightness" is just "call with no `value`" rather than a second
 * manifest — `getBrightnessAsync()` runs either way and its result is
 * what the handler reports back.
 *
 * Scoped to app-window brightness only (`expo-brightness`'s
 * `getBrightnessAsync`/`setBrightnessAsync`, not the system-wide
 * variants) — research 0009's own finding: system-wide writes on
 * Android need `WRITE_SETTINGS`, a special permission granted through a
 * system settings screen rather than a normal runtime dialog; app-window
 * brightness needs neither that nor any special permission on either
 * platform, confirmed by reading `expo-brightness`'s own doc comments
 * (only the system-wide functions mention anything permission-related).
 *
 * Torch (`device_set_torch`, task 11.2) is the other tool here — unlike
 * brightness it has no meaningful "read" state, so `on` is required, not
 * optional. `expo-camera` has no imperative torch API at all, only a
 * `<CameraView>` prop; see `torchBridge.ts`/`TorchHost.tsx` for how the
 * handler reaches a live one.
 */

export const DEVICE_SET_BRIGHTNESS_MANIFEST: ConnectorManifestTier3 = {
  manifestVersion: 1,
  id: 'fs.sovereign.device.set-brightness',
  name: 'Device — Brightness',
  version: '1.0.0',
  summary: "Reads or sets this app's own screen brightness.",
  tier: 3,
  platforms: ['ios', 'android'],
  tool: {
    name: 'device_set_brightness',
    description:
      "Reads or sets this app's own window brightness. Omit value to " +
      'only read the current brightness.',
    parameters: {
      type: 'object',
      properties: {
        value: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description:
            'The brightness to set, from 0 (darkest) to 1 (brightest). Omit to leave it unchanged and only read the current value.',
        },
      },
    },
  },
  permissions: { device: { capabilities: ['device.brightness'] } },
  handler: { capability: 'device.brightness' },
  pricing: { model: 'free' },
};

export const DEVICE_SET_TORCH_MANIFEST: ConnectorManifestTier3 = {
  manifestVersion: 1,
  id: 'fs.sovereign.device.set-torch',
  name: 'Device — Flashlight',
  version: '1.0.0',
  summary: 'Turns this device’s flashlight on or off.',
  tier: 3,
  platforms: ['ios', 'android'],
  tool: {
    name: 'device_set_torch',
    description: 'Turns the flashlight on or off.',
    parameters: {
      type: 'object',
      properties: {
        on: {
          type: 'boolean',
          description: 'true to turn the flashlight on, false to turn it off.',
        },
      },
      required: ['on'],
    },
  },
  permissions: { device: { capabilities: ['device.torch'] } },
  handler: { capability: 'device.torch' },
  pricing: { model: 'free' },
};

export const DEVICE_MANIFESTS: ConnectorManifestTier3[] = [
  DEVICE_SET_BRIGHTNESS_MANIFEST,
  DEVICE_SET_TORCH_MANIFEST,
];
