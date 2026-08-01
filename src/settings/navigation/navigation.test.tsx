import { render, userEvent } from '@testing-library/react-native';

import { ThemeProvider } from '@/design-system';

import { ModelSessionProvider } from '../ModelSessionProvider';
import { RootNavigator } from './RootNavigator';

/**
 * Exercises the checklist for task 8.1 — every core screen reachable — by
 * navigating rather than by asserting the route table exists. A screen wired
 * into a navigator but unreachable from the UI passes a config assertion and
 * fails the user.
 */
jest.mock('expo-device', () => ({ totalMemory: 8 * 1024 ** 3 }));

function renderApp() {
  return render(
    <ThemeProvider initialPreference="light">
      {/* Chat and Models both read the session; the navigator is only
          reachable below it in the real app. */}
      <ModelSessionProvider>
        <RootNavigator />
      </ModelSessionProvider>
    </ThemeProvider>,
  );
}

describe('RootNavigator', () => {
  it('opens on the chat screen', async () => {
    const s = await renderApp();
    expect(s.getByText(/On-device/)).toBeTruthy();
  });

  it('reaches the model manager', async () => {
    const s = await renderApp();
    await userEvent.press(s.getByLabelText('Models tab'));
    expect(s.getByText(/Qwen2.5 0.5B Instruct/)).toBeTruthy();
  });

  it('reaches settings', async () => {
    const s = await renderApp();
    await userEvent.press(s.getByLabelText('Settings tab'));
    expect(s.getByText('Match system')).toBeTruthy();
  });

  it('reaches connector settings from within settings', async () => {
    // Two hops: this is the screen most likely to be wired up but orphaned,
    // since nothing else links to it.
    const s = await renderApp();
    await userEvent.press(s.getByLabelText('Settings tab'));
    await userEvent.press(s.getByText('Connectors'));
    expect(s.getByText('No connectors are installed.')).toBeTruthy();
  });

  it('states plainly that nothing can reach the network', async () => {
    // The product's central claim, shown where a user would look for it.
    const s = await renderApp();
    await userEvent.press(s.getByLabelText('Settings tab'));
    await userEvent.press(s.getByText('Connectors'));
    expect(
      s.getByText(/Nothing in this app can reach the network/),
    ).toBeTruthy();
  });

  it('changes the theme preference from settings', async () => {
    const s = await renderApp();
    await userEvent.press(s.getByLabelText('Settings tab'));
    await userEvent.press(s.getByText('Dark'));
    // The switch for the selected option reflects the new preference.
    expect(s.getByLabelText('Dark').props.value).toBe(true);
    expect(s.getByLabelText('Match system').props.value).toBe(false);
  });
});
