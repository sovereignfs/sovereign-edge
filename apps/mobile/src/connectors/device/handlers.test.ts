import { setBrightness, setTorch } from './handlers';
import {
  getTorchController,
  setPermissionGrantedListener,
  setTorchController,
} from './torchBridge';

const mockSetBrightnessAsync = jest.fn();
const mockGetBrightnessAsync = jest.fn();

jest.mock('expo-brightness', () => ({
  setBrightnessAsync: (...args: unknown[]) => mockSetBrightnessAsync(...args),
  getBrightnessAsync: () => mockGetBrightnessAsync(),
}));

const mockEnsureCameraAccess = jest.fn();
jest.mock('../permissions/cameraAccess', () => ({
  ensureCameraAccess: () => mockEnsureCameraAccess(),
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

describe('setTorch', () => {
  beforeEach(() => {
    mockEnsureCameraAccess.mockReset();
    setTorchController(null);
    setPermissionGrantedListener(null);
  });

  it('refuses a missing on argument', async () => {
    const result = await setTorch({});
    expect(result).toEqual({
      ok: false,
      reason: 'invalid-arguments',
      detail: 'on must be a boolean.',
    });
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
  });

  it('refuses a non-boolean on argument', async () => {
    const result = await setTorch({ on: 'yes' });
    expect(result).toEqual({
      ok: false,
      reason: 'invalid-arguments',
      detail: 'on must be a boolean.',
    });
  });

  it('reports a handler-error when camera access is denied', async () => {
    mockEnsureCameraAccess.mockResolvedValue({ granted: false });
    const controller = { setTorch: jest.fn() };
    setTorchController(controller);
    const result = await setTorch({ on: true });
    expect(result).toEqual({
      ok: false,
      reason: 'handler-error',
      detail:
        'Camera access was not allowed, so the flashlight cannot be controlled.',
    });
    expect(controller.setTorch).not.toHaveBeenCalled();
  });

  it('does not notify the permission-granted listener when camera access is denied', async () => {
    mockEnsureCameraAccess.mockResolvedValue({ granted: false });
    const listener = jest.fn();
    setPermissionGrantedListener(listener);
    await setTorch({ on: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies the permission-granted listener so TorchHost can mount', async () => {
    mockEnsureCameraAccess.mockResolvedValue({ granted: true });
    const listener = jest.fn();
    setPermissionGrantedListener(listener);
    setTorchController({ setTorch: jest.fn() });
    await setTorch({ on: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reports a handler-error when no torch controller is registered', async () => {
    mockEnsureCameraAccess.mockResolvedValue({ granted: true });
    const result = await setTorch({ on: true });
    expect(result).toEqual({
      ok: false,
      reason: 'handler-error',
      detail: 'The flashlight is not available right now.',
    });
  });

  it('turns the torch on and reports success', async () => {
    mockEnsureCameraAccess.mockResolvedValue({ granted: true });
    const controller = { setTorch: jest.fn() };
    setTorchController(controller);
    const result = await setTorch({ on: true });
    expect(controller.setTorch).toHaveBeenCalledWith(true);
    expect(result).toEqual({ ok: true, text: 'Flashlight turned on.' });
  });

  it('turns the torch off and reports success', async () => {
    mockEnsureCameraAccess.mockResolvedValue({ granted: true });
    const controller = { setTorch: jest.fn() };
    setTorchController(controller);
    const result = await setTorch({ on: false });
    expect(controller.setTorch).toHaveBeenCalledWith(false);
    expect(result).toEqual({ ok: true, text: 'Flashlight turned off.' });
  });

  it('leaves no controller registered when torchBridge starts clean', () => {
    expect(getTorchController()).toBeNull();
  });
});
