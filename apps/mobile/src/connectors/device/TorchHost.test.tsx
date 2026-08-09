import { render, waitFor } from '@testing-library/react-native';
import type { RenderResult } from '@testing-library/react-native';

import { TorchHost } from './TorchHost';
import {
  getTorchController,
  notifyCameraPermissionGranted,
  setPermissionGrantedListener,
} from './torchBridge';

const mockGetCameraPermissionsAsync = jest.fn();

jest.mock('expo-camera', () => {
  const react = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    Camera: {
      getCameraPermissionsAsync: () => mockGetCameraPermissionsAsync(),
    },
    CameraView: () => react.createElement(Text, null, 'camera-view'),
  };
});

describe('TorchHost', () => {
  let current: RenderResult | null = null;

  beforeEach(() => {
    mockGetCameraPermissionsAsync.mockReset();
    setPermissionGrantedListener(null);
  });

  afterEach(() => {
    current?.unmount();
    current = null;
  });

  it('renders nothing and registers a controller when permission is not yet granted', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ status: 'denied' });
    current = await render(<TorchHost />);
    expect(current.queryByText('camera-view')).toBeNull();
    expect(getTorchController()).not.toBeNull();
  });

  it('renders the CameraView once permission was already granted in a prior session', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    current = await render(<TorchHost />);
    const s = current;
    await waitFor(() => expect(s.queryByText('camera-view')).toBeTruthy());
  });

  it('mounts the CameraView once notified of a fresh grant', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ status: 'denied' });
    current = await render(<TorchHost />);
    const s = current;
    expect(s.queryByText('camera-view')).toBeNull();

    notifyCameraPermissionGranted();
    await waitFor(() => expect(s.queryByText('camera-view')).toBeTruthy());
  });

  it('clears the controller and listener on unmount', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ status: 'denied' });
    current = await render(<TorchHost />);
    expect(getTorchController()).not.toBeNull();

    current.unmount();
    current = null;
    // `useEffect` cleanup is a passive effect — under React 19's
    // scheduling it does not always flush synchronously with `unmount()`,
    // so poll rather than assert immediately.
    await waitFor(() => expect(getTorchController()).toBeNull());
  });
});
