import { fireEvent, render, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { darkColors, lightColors } from 'design-tokens';

import { ThemeProvider } from '../ThemeProvider';
import { Button, ChatBubble, ListItem, TextField, Toggle } from './index';

/**
 * Returns the render result and queries from it, rather than using RNTL's
 * global `screen`. Several tests render twice to compare schemes, and mixing
 * `screen` with more than one live tree makes results depend on test order —
 * which showed up as failures that vanished when a test ran alone.
 */
function renderThemed(ui: ReactElement, scheme: 'light' | 'dark' = 'light') {
  return render(<ThemeProvider initialPreference={scheme}>{ui}</ThemeProvider>);
}

/** Flattens RN's array-of-styles into one object. */
function styleOf(node: {
  props: { style?: unknown };
}): Record<string, unknown> {
  const flatten = (s: unknown): Record<string, unknown> =>
    Array.isArray(s)
      ? Object.assign({}, ...s.map(flatten))
      : ((s as Record<string, unknown>) ?? {});
  return flatten(node.props.style);
}

describe('Button', () => {
  it('calls onPress when enabled', async () => {
    const onPress = jest.fn();
    const s = await renderThemed(<Button label="Send" onPress={onPress} />);
    await userEvent.press(s.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while loading', async () => {
    const onPress = jest.fn();
    const s = await renderThemed(
      <Button label="Send" loading onPress={onPress} />,
    );
    await userEvent.press(s.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('announces disabled and busy state to assistive tech', async () => {
    // A spinner alone is invisible to a screen reader; the state is what a
    // non-sighted user actually receives.
    const s = await renderThemed(<Button label="Send" loading />);
    const button = s.getByRole('button');
    expect(button.props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
  });

  it('meets the minimum touch target at default size', async () => {
    const s = await renderThemed(<Button label="Send" />);
    expect(styleOf(s.getByRole('button')).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('takes its colours from the active scheme', async () => {
    const light = await renderThemed(<Button label="Send" />, 'light');
    const dark = await renderThemed(<Button label="Send" />, 'dark');

    expect(styleOf(light.getByRole('button')).backgroundColor).toBe(
      lightColors.accent,
    );
    expect(styleOf(dark.getByRole('button')).backgroundColor).toBe(
      darkColors.accent,
    );
  });
});

describe('TextField', () => {
  it('shows an error in place of the hint', async () => {
    const s = await renderThemed(
      <TextField label="URL" hint="Where to reach it" error="Required" />,
    );
    expect(s.getByText('Required')).toBeTruthy();
    expect(s.queryByText('Where to reach it')).toBeNull();
  });

  it('shows the hint when there is no error', async () => {
    const s = await renderThemed(
      <TextField label="URL" hint="Where to reach it" />,
    );
    expect(s.getByText('Where to reach it')).toBeTruthy();
  });

  it('labels the input for assistive tech', async () => {
    const s = await renderThemed(<TextField label="Instance URL" />);
    expect(s.getByLabelText('Instance URL')).toBeTruthy();
  });
});

describe('ChatBubble', () => {
  it('renders user and assistant messages differently', async () => {
    const user = await renderThemed(<ChatBubble role="user" text="Hi" />);
    const assistant = await renderThemed(
      <ChatBubble role="assistant" text="Hi" />,
    );

    expect(styleOf(user.getByText('Hi').parent!).backgroundColor).not.toBe(
      styleOf(assistant.getByText('Hi').parent!).backgroundColor,
    );
  });

  it('marks a streaming reply as in progress', async () => {
    // An empty or half-written reply must not read as a finished one.
    const s = await renderThemed(
      <ChatBubble role="assistant" text="Thin" streaming />,
    );
    expect(s.getByText(/▌/)).toBeTruthy();
  });

  it('names the connector that answered', async () => {
    // Required by research 0001: the UI always shows which connector, if any,
    // reached the network for a reply.
    const s = await renderThemed(
      <ChatBubble role="assistant" text="It is sunny." connector="Search" />,
    );
    // The receipt (task 7.5) is the connector name next to the brand mark
    // glyph, not embedded "via X" text inside the bubble itself.
    expect(s.getByLabelText('Answered using the Search connector')).toBeTruthy();
    expect(s.getByText('Search')).toBeTruthy();
  });

  it('says nothing about connectors for a purely local reply', async () => {
    const s = await renderThemed(
      <ChatBubble role="assistant" text="Local answer." />,
    );
    expect(s.queryByText(/^via /)).toBeNull();
  });
});

describe('ListItem', () => {
  it('is not announced as a button when it does not act', async () => {
    const s = await renderThemed(<ListItem title="Version" subtitle="0.1.7" />);
    expect(s.queryByRole('button')).toBeNull();
    expect(s.getByText('Version')).toBeTruthy();
  });

  it('is pressable when given an onPress', async () => {
    const onPress = jest.fn();
    const s = await renderThemed(
      <ListItem title="Delete model" onPress={onPress} />,
    );
    await userEvent.press(s.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    const s = await renderThemed(
      <ListItem title="Delete model" onPress={onPress} disabled />,
    );
    await userEvent.press(s.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Toggle', () => {
  it('reports changes', async () => {
    const onValueChange = jest.fn();
    const s = await renderThemed(
      <Toggle
        value={false}
        onValueChange={onValueChange}
        accessibilityLabel="Offline only"
      />,
    );
    // Switch emits a value change rather than a press, and the queried host
    // node does not expose the handler directly — fireEvent is the supported
    // way to drive it.
    fireEvent(s.getByLabelText('Offline only'), 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
