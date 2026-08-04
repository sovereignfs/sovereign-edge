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
    expect(s.getByText('No connectors are set up.')).toBeTruthy();
  });

  it('reaches Search setup from connector settings (task 3.1)', async () => {
    // Three hops: the row most likely to be wired up but orphaned once a
    // second screen sits behind Connectors.
    const s = await renderApp();
    await userEvent.press(s.getByLabelText('Settings tab'));
    await userEvent.press(s.getByText('Connectors'));
    await userEvent.press(s.getByText('Search'));
    expect(s.getByLabelText('Instance URL')).toBeTruthy();
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

  it('reflects a completed Search setup back on the Connectors screen', async () => {
    // Found on a real device: ConnectorsScreen reads config at render time,
    // and React Navigation does not re-render a screen just because it
    // regained focus — returning from setup showed stale "not set up" state
    // even though the save had genuinely worked. This exercises the full
    // round trip a mocked unit test never could.
    //
    // Last in the file deliberately: it persists real config through the
    // unmocked expo-file-system test double, which is not reset between
    // tests, so anything asserting on the empty state must run before it.
    const s = await renderApp();
    await userEvent.press(s.getByLabelText('Settings tab'));
    await userEvent.press(s.getByText('Connectors'));
    await userEvent.press(s.getByText('Search'));

    await userEvent.type(
      s.getByLabelText('Instance URL'),
      'https://searx.example.org',
    );
    await userEvent.press(s.getByText('Save & enable'));

    expect(await s.findByText('Search (SearXNG)')).toBeTruthy();
    expect(s.getByText('ALLOWED')).toBeTruthy();
    expect(s.queryByText('Not set up — tap to choose a provider')).toBeNull();

    // Also found on a real device: once configured, there was no way back
    // into setup to fix a mistyped key or switch provider — only grant/
    // revoke on the existing configuration.
    await userEvent.press(s.getByText('Change provider or key'));
    expect(await s.findByLabelText('Instance URL')).toBeTruthy();
  });
});
