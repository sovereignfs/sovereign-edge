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
 * Torch (`device.set_torch`, the epic's other originally-scoped tool) is
 * not here — `expo-camera` has no imperative torch API at all, only a
 * `<CameraView>` prop, a real architecture change from every other Tier 3
 * handler in this app. Scoped as its own fast-follow task (11.2).
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

export const DEVICE_MANIFESTS: ConnectorManifestTier3[] = [
  DEVICE_SET_BRIGHTNESS_MANIFEST,
];
