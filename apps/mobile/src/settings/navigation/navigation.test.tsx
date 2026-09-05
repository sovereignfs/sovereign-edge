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
    expect(s.getByRole('tab', { name: 'System' })).toBeTruthy();
  });

  it('reaches connector settings from within settings', async () => {
    // Two hops: this is the screen most likely to be wired up but orphaned,
    // since nothing else links to it.
    const s = await renderApp();
    await userEvent.press(s.getByLabelText('Settings tab'));
    await userEvent.press(s.getByText('Connectors'));
    expect(s.getByText('No connectors are set up.')).toBeTruthy();
  });

  it('reaches the dev-only embedding spike from settings (task 16.1)', async () => {
    // Both the row and the route are `__DEV__`-gated, and Jest runs with
    // `__DEV__` true — so this asserts the wiring holds in the builds where
    // the screen is meant to exist. It says nothing about release builds,
    // where the guard is the point and the route is absent by construction.
    const s = await renderApp();
    await userEvent.press(s.getByLabelText('Settings tab'));
    await userEvent.press(s.getByText('Embedding Spike'));
    // A candidate row, not a section heading: this asserts the screen reached
    // the catalog and rendered a model the model manager deliberately hides.
    expect(s.getByText('BGE Small EN v1.5')).toBeTruthy();
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
    // The segment for the selected option reflects the new preference.
    expect(
      s.getByRole('tab', { name: 'Dark' }).props.accessibilityState.selected,
    ).toBe(true);
    expect(
      s.getByRole('tab', { name: 'System' }).props.accessibilityState.selected,
    ).toBe(false);
  });

  it('saves a Search configuration end to end, from the Connectors list', async () => {
    // Exercises the full round trip through the unmocked expo-file-system
    // test double: Connectors → Search detail → save → the detail screen's
    // own state (pill, scope, Revoke) reflects it immediately, since saving
    // no longer bounces the user back to the list to find out.
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
    await userEvent.press(s.getByText('Save & grant access'));

    await s.findByText('Save changes');
    expect(s.getByText('Allowed')).toBeTruthy();
    expect(s.getByText('https://searx.example.org')).toBeTruthy();
    expect(s.getByText('Revoke access')).toBeTruthy();
  });
});
