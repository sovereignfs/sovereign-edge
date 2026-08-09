import { validateManifest } from '@sovereignfs/connector-sdk';

import {
  DEVICE_MANIFESTS,
  DEVICE_SET_BRIGHTNESS_MANIFEST,
  DEVICE_SET_TORCH_MANIFEST,
} from './manifest';

describe('device manifests', () => {
  it('has exactly two manifests', () => {
    expect(DEVICE_MANIFESTS).toHaveLength(2);
    expect(DEVICE_MANIFESTS).toEqual([
      DEVICE_SET_BRIGHTNESS_MANIFEST,
      DEVICE_SET_TORCH_MANIFEST,
    ]);
  });

  describe('brightness', () => {
    it('validates against the real connector-sdk schema', () => {
      const result = validateManifest(DEVICE_SET_BRIGHTNESS_MANIFEST);
      expect(result.valid).toBe(true);
    });

    it('declares no required parameters, since value is optional', () => {
      expect(
        DEVICE_SET_BRIGHTNESS_MANIFEST.tool.parameters.required,
      ).toBeUndefined();
    });

    it('declares its handler capability as its permission scope', () => {
      expect(
        DEVICE_SET_BRIGHTNESS_MANIFEST.permissions.device.capabilities,
      ).toEqual([DEVICE_SET_BRIGHTNESS_MANIFEST.handler.capability]);
    });

    it('declares itself mobile-only', () => {
      expect(DEVICE_SET_BRIGHTNESS_MANIFEST.platforms).toEqual([
        'ios',
        'android',
      ]);
    });
  });

  describe('torch', () => {
    it('validates against the real connector-sdk schema', () => {
      const result = validateManifest(DEVICE_SET_TORCH_MANIFEST);
      expect(result.valid).toBe(true);
    });

    it('requires the on parameter', () => {
      expect(DEVICE_SET_TORCH_MANIFEST.tool.parameters.required).toEqual([
        'on',
      ]);
    });

    it('declares its handler capability as its permission scope', () => {
      expect(
        DEVICE_SET_TORCH_MANIFEST.permissions.device.capabilities,
      ).toEqual([DEVICE_SET_TORCH_MANIFEST.handler.capability]);
    });

    it('declares itself mobile-only', () => {
      expect(DEVICE_SET_TORCH_MANIFEST.platforms).toEqual(['ios', 'android']);
    });
  });
});
