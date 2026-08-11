import { render, screen } from '@testing-library/react-native';
import { Text, useColorScheme } from 'react-native';

import { darkColors, lightColors } from 'design-tokens';

import { ThemeProvider, useTheme, useThemePreference } from './ThemeProvider';
import { darkTheme, lightTheme } from './theme';

jest.mock('react-native/Libraries/Utilities/useColorScheme');
const mockUseColorScheme = jest.mocked(useColorScheme);

function ShowScheme() {
  const theme = useTheme();
  return (
    <Text>{`scheme:${theme.scheme} surface:${theme.colors.surface}`}</Text>
  );
}

describe('theme tokens', () => {
  it('keeps scale tokens identical across schemes', () => {
    // Upstream calls these "theme-stable": spacing and type sizes do not
    // change when the lights go out, only colour and shadow do.
    expect(darkTheme.space).toBe(lightTheme.space);
    expect(darkTheme.radius).toBe(lightTheme.radius);
    expect(darkTheme.fontSize).toBe(lightTheme.fontSize);
    expect(darkTheme.touchTargetMin).toBe(lightTheme.touchTargetMin);
  });

  it('defines every semantic colour in both schemes', () => {
    // A key present in one scheme but not the other is invisible until
    // someone switches themes and finds an undefined colour.
    expect(Object.keys(darkColors).sort()).toEqual(
      Object.keys(lightColors).sort(),
    );
  });

  it('inverts surface and text between schemes', () => {
    expect(lightColors.surface).not.toBe(darkColors.surface);
    expect(lightColors.textPrimary).not.toBe(darkColors.textPrimary);
    // Light text on light surface would mean the port dropped an override.
    expect(lightColors.textPrimary).not.toBe(lightColors.surface);
    expect(darkColors.textPrimary).not.toBe(darkColors.surface);
  });

  it('meets the 44dp minimum touch target', () => {
    expect(lightTheme.touchTargetMin).toBeGreaterThanOrEqual(44);
  });
});

describe('ThemeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColorScheme.mockReturnValue('light');
  });

  it('follows the system scheme by default', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    await render(
      <ThemeProvider>
        <ShowScheme />
      </ThemeProvider>,
    );
    expect(
      screen.getByText(`scheme:dark surface:${darkColors.surface}`),
    ).toBeTruthy();
  });

  it('falls back to light when the OS reports no preference', async () => {
    // RN 0.86 types this as 'light' | 'dark' | 'unspecified'. The third value
    // is not a scheme, so it must resolve to something rather than leaking
    // through as an undefined theme.
    mockUseColorScheme.mockReturnValue('unspecified');
    await render(
      <ThemeProvider>
        <ShowScheme />
      </ThemeProvider>,
    );
    expect(
      screen.getByText(`scheme:light surface:${lightColors.surface}`),
    ).toBeTruthy();
  });

  it('lets an explicit preference override the system', async () => {
    mockUseColorScheme.mockReturnValue('light');
    await render(
      <ThemeProvider initialPreference="dark">
        <ShowScheme />
      </ThemeProvider>,
    );
    expect(
      screen.getByText(`scheme:dark surface:${darkColors.surface}`),
    ).toBeTruthy();
  });

  it('throws outside a provider rather than silently defaulting', async () => {
    // A silent default would render light components inside a dark app and
    // look like a styling bug rather than a missing provider.
    // `render` is async in RNTL 14, so the throw surfaces as a rejection.
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<ShowScheme />)).rejects.toThrow(/ThemeProvider/);
    quiet.mockRestore();
  });

  it('exposes the preference for a settings screen', async () => {
    // Rendered rather than captured into an outer variable: assigning during
    // render is a side effect, and the React Compiler lint rule rejects it.
    function ReadPreference() {
      return <Text>{`preference:${useThemePreference().preference}`}</Text>;
    }
    await render(
      <ThemeProvider initialPreference="system">
        <ReadPreference />
      </ThemeProvider>,
    );
    expect(screen.getByText('preference:system')).toBeTruthy();
  });
});
