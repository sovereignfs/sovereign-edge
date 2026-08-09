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

function renderScreen(onNavigate = vi.fn()) {
  render(
    <ThemeProvider>
      <SettingsScreen onNavigate={onNavigate} />
    </ThemeProvider>,
  );
  return { onNavigate };
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

  it('shows the Privacy section and navigates to Connectors on click', async () => {
    getVersion.mockResolvedValue('0.1.5');
    const { onNavigate } = renderScreen();

    const row = screen.getByText('Connectors');
    expect(
      screen.getByText('The only way anything here reaches the network'),
    ).toBeInTheDocument();

    const button = row.closest('button');
    if (!button) throw new Error('the Connectors row is not clickable');
    await userEvent.click(button);

    expect(onNavigate).toHaveBeenCalledWith('connectors');
  });

  it('shows the offline-by-design reassurance in About', async () => {
    getVersion.mockResolvedValue('0.1.5');
    renderScreen();

    expect(screen.getByText('Offline by design')).toBeInTheDocument();
    expect(
      screen.getByText('Sovereign Edge has no network code in its chat path.'),
    ).toBeInTheDocument();
  });
});
