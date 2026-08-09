import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'desktop-ui';
import { ModeBar } from './ModeBar';

function renderModeBar(active: 'plain' | 'search' = 'plain') {
  const onSelect = vi.fn();
  render(
    <ThemeProvider>
      <ModeBar active={active} onSelect={onSelect} />
    </ThemeProvider>,
  );
  return { onSelect };
}

describe('ModeBar', () => {
  it('renders one chip per mode with the exact accessible name convention', () => {
    renderModeBar();
    expect(
      screen.getByRole('button', { name: 'Chat mode' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Fix grammar mode' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search mode' }),
    ).toBeInTheDocument();
  });

  it('marks exactly the active mode as pressed', () => {
    renderModeBar('search');
    expect(screen.getByRole('button', { name: 'Search mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Chat mode' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('calls onSelect with the clicked mode id', async () => {
    const { onSelect } = renderModeBar();
    await userEvent.click(screen.getByRole('button', { name: 'Draft mode' }));
    expect(onSelect).toHaveBeenCalledWith('draft');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
