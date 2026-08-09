import { ensureCameraAccess } from './cameraAccess';

const mockGetCameraPermissionsAsync = jest.fn();
const mockRequestCameraPermissionsAsync = jest.fn();

jest.mock('expo-camera', () => ({
  Camera: {
    getCameraPermissionsAsync: () => mockGetCameraPermissionsAsync(),
    requestCameraPermissionsAsync: () => mockRequestCameraPermissionsAsync(),
  },
}));

describe('ensureCameraAccess', () => {
  beforeEach(() => {
    mockGetCameraPermissionsAsync.mockReset();
    mockRequestCameraPermissionsAsync.mockReset();
  });

  it('skips prompting when already granted', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ status: 'granted' });
    const result = await ensureCameraAccess();
    expect(result).toEqual({ granted: true });
    expect(mockRequestCameraPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts when undetermined and reports a granted result', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
    });
    mockRequestCameraPermissionsAsync.mockResolvedValue({
      status: 'granted',
    });
    const result = await ensureCameraAccess();
    expect(result).toEqual({ granted: true });
    expect(mockRequestCameraPermissionsAsync).toHaveBeenCalled();
  });

  it('reports a denied result without granting', async () => {
    mockGetCameraPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockRequestCameraPermissionsAsync.mockResolvedValue({ status: 'denied' });
    const result = await ensureCameraAccess();
    expect(result).toEqual({ granted: false });
  });
});
