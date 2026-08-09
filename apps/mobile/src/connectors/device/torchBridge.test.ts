import {
  getTorchController,
  notifyCameraPermissionGranted,
  setPermissionGrantedListener,
  setTorchController,
} from './torchBridge';

describe('torchBridge', () => {
  afterEach(() => {
    setTorchController(null);
    setPermissionGrantedListener(null);
  });

  it('has no controller registered by default', () => {
    expect(getTorchController()).toBeNull();
  });

  it('returns the registered controller', () => {
    const controller = { setTorch: jest.fn() };
    setTorchController(controller);
    expect(getTorchController()).toBe(controller);
  });

  it('clears the controller when set to null', () => {
    setTorchController({ setTorch: jest.fn() });
    setTorchController(null);
    expect(getTorchController()).toBeNull();
  });

  it('does nothing when notifying with no listener registered', () => {
    expect(() => notifyCameraPermissionGranted()).not.toThrow();
  });

  it('calls the registered permission-granted listener', () => {
    const listener = jest.fn();
    setPermissionGrantedListener(listener);
    notifyCameraPermissionGranted();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops calling a listener after it is cleared', () => {
    const listener = jest.fn();
    setPermissionGrantedListener(listener);
    setPermissionGrantedListener(null);
    notifyCameraPermissionGranted();
    expect(listener).not.toHaveBeenCalled();
  });
});
