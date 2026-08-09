import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'desktop-ui';
import { SettingsScreen } from './SettingsScreen';

const getVersion = vi.fn();
const check = vi.fn();
const relaunch = vi.fn();

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: () => getVersion(),
}));
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => check(),
}));
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: () => relaunch(),
}));

function renderScreen() {
  render(
    <ThemeProvider>
      <SettingsScreen />
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('SettingsScreen', () => {
  it('renders the three theme options with System selected by default', async () => {
    getVersion.mockResolvedValue('0.1.5');
    renderScreen();

    await screen.findByText('Sovereign Edge 0.1.5');
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('selecting Light makes exactly Light checked, mutually exclusive with the others', async () => {
    getVersion.mockResolvedValue('0.1.5');
    renderScreen();

    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));

    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('shows "You\'re on the latest version" when the update check finds nothing', async () => {
    getVersion.mockResolvedValue('0.1.5');
    check.mockResolvedValue(null);
    renderScreen();

    await userEvent.click(
      screen.getByRole('button', { name: 'Check for Updates' }),
    );

    expect(
      await screen.findByText("You're on the latest version."),
    ).toBeInTheDocument();
  });

  it('shows a download button naming the version when an update is available', async () => {
    getVersion.mockResolvedValue('0.1.5');
    check.mockResolvedValue({ version: '0.2.0' });
    renderScreen();

    await userEvent.click(
      screen.getByRole('button', { name: 'Check for Updates' }),
    );

    expect(
      await screen.findByRole('button', {
        name: 'Download and Install v0.2.0',
      }),
    ).toBeInTheDocument();
  });

  it('shows the real error message when the update check fails', async () => {
    getVersion.mockResolvedValue('0.1.5');
    check.mockRejectedValue(new Error('offline'));
    renderScreen();

    await userEvent.click(
      screen.getByRole('button', { name: 'Check for Updates' }),
    );

    expect(
      await screen.findByText('Update check failed: offline'),
    ).toBeInTheDocument();
  });
});
