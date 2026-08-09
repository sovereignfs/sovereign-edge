import { setBrightness } from './handlers';

const mockSetBrightnessAsync = jest.fn();
const mockGetBrightnessAsync = jest.fn();

jest.mock('expo-brightness', () => ({
  setBrightnessAsync: (...args: unknown[]) => mockSetBrightnessAsync(...args),
  getBrightnessAsync: () => mockGetBrightnessAsync(),
}));

describe('setBrightness', () => {
  beforeEach(() => {
    mockSetBrightnessAsync.mockReset().mockResolvedValue(undefined);
    mockGetBrightnessAsync.mockReset().mockResolvedValue(0.5);
  });

  it('reads the current brightness without writing when value is omitted', async () => {
    const result = await setBrightness({});
    expect(mockSetBrightnessAsync).not.toHaveBeenCalled();
    expect(mockGetBrightnessAsync).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, text: 'Brightness is now 0.50.' });
  });

  it('sets then reports the resulting brightness when value is provided', async () => {
    mockGetBrightnessAsync.mockResolvedValue(0.75);
    const result = await setBrightness({ value: 0.75 });
    expect(mockSetBrightnessAsync).toHaveBeenCalledWith(0.75);
    expect(result).toEqual({ ok: true, text: 'Brightness is now 0.75.' });
  });

  it('refuses a value below 0', async () => {
    const result = await setBrightness({ value: -0.1 });
    expect(result).toEqual({
      ok: false,
      reason: 'invalid-arguments',
      detail: 'value must be a number between 0 and 1.',
    });
    expect(mockSetBrightnessAsync).not.toHaveBeenCalled();
  });

  it('refuses a value above 1', async () => {
    const result = await setBrightness({ value: 1.1 });
    expect(result).toEqual({
      ok: false,
      reason: 'invalid-arguments',
      detail: 'value must be a number between 0 and 1.',
    });
  });

  it('refuses a non-numeric value', async () => {
    const result = await setBrightness({ value: 'bright' });
    expect(result).toEqual({
      ok: false,
      reason: 'invalid-arguments',
      detail: 'value must be a number between 0 and 1.',
    });
  });

  it('reports a handler-error when setBrightnessAsync throws', async () => {
    mockSetBrightnessAsync.mockRejectedValue(new Error('no display'));
    const result = await setBrightness({ value: 0.5 });
    expect(result).toEqual({
      ok: false,
      reason: 'handler-error',
      detail: 'no display',
    });
  });

  it('reports a handler-error when getBrightnessAsync throws', async () => {
    mockGetBrightnessAsync.mockRejectedValue(new Error('unavailable'));
    const result = await setBrightness({});
    expect(result).toEqual({
      ok: false,
      reason: 'handler-error',
      detail: 'unavailable',
    });
  });
});
