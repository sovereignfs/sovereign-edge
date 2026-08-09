import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import App from './App';
import { APP_NAME } from '@/shared/app-info';

/**
 * `SafeAreaProvider` measures its frame before rendering children, which never
 * happens in a test environment — left real, the tree is an empty
 * `<RNCSafeAreaProvider />` and nothing below it exists.
 *
 * Only that export is replaced, and the replacement still supplies the real
 * contexts with fixed values. Two shortcuts failed first: stubbing the whole
 * module removed `SafeAreaInsetsContext`, which
 * `@react-navigation/bottom-tabs` consumes directly; and a provider that
 * merely passed children through left `useSafeAreaInsets()` with nothing to
 * read, which it treats as a missing provider and throws on.
 */
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: ReactNode }) => (
      <actual.SafeAreaFrameContext.Provider value={frame}>
        <actual.SafeAreaInsetsContext.Provider value={insets}>
          {children}
        </actual.SafeAreaInsetsContext.Provider>
      </actual.SafeAreaFrameContext.Provider>
    ),
  };
});
jest.mock('expo-device', () => ({ totalMemory: 8 * 1024 ** 3 }));
// `TorchHost` (task 11.2) checks camera permission status on mount — give
// it a resolved, non-granted response rather than jest-expo's default
// automock (which resolves `undefined`, not a `PermissionResponse`).
jest.mock('expo-camera', () => ({
  Camera: {
    getCameraPermissionsAsync: () =>
      Promise.resolve({ status: 'undetermined' }),
  },
  CameraView: () => null,
}));

describe('App', () => {
  it('mounts the navigator and opens on chat', async () => {
    // Task 0.1.1's version asserted a placeholder screen; that placeholder is
    // gone now that App composes the real navigator (task 8.1). Screen-level
    // routing is covered in src/settings/navigation.
    // Asserted on the trust banner rather than the empty state: the latter's
    // copy depends on whether a model is installed, which is not what this
    // test is about.
    const s = await render(<App />);
    expect(s.getByText(/On-device/)).toBeTruthy();
  });

  it('resolves modules through the @/ alias', () => {
    expect(APP_NAME).toBe('Sovereign Edge');
  });
});
