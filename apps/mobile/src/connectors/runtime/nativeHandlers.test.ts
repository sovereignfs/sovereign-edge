import { nativeHandlerFor } from './nativeHandlers';

jest.mock('expo-device', () => ({
  modelName: 'iPhone 17',
  osName: 'iOS',
  osVersion: '19.0',
}));

describe('nativeHandlerFor', () => {
  it('returns undefined for a capability nothing has registered', () => {
    expect(nativeHandlerFor('calendar.write')).toBeUndefined();
  });

  it('resolves device.info to a handler that reports the device model and OS', async () => {
    const handler = nativeHandlerFor('device.info');
    expect(handler).toBeDefined();

    const result = await handler!({});

    expect(result).toEqual({ ok: true, text: 'iPhone 17 iOS (19.0)' });
  });
});
