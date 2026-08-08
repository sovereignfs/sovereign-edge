import styles from './Toggle.module.css';

export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
};

/**
 * Unlike mobile's `Toggle` (a thin wrapper around React Native's native
 * `Switch`, deliberately untinted — see that file's own doc comment on how
 * two attempts to theme it made dark mode *worse*), the web has no
 * equivalent "free, already-legible OS switch" to defer to:
 * `<input type="checkbox">` renders as a checkbox, not a switch, and isn't
 * reliably restylable as one consistently across engines. So this is a
 * themed `role="switch"` button built from scratch — a deliberate,
 * necessary difference from mobile's approach, not an oversight of its
 * lesson (mobile's lesson was "don't fight a good platform control";
 * there's no equivalent platform control here to fight or defer to).
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  'aria-label': ariaLabel,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onValueChange(!value)}
      className={[styles.track, value ? styles.trackChecked : '']
        .join(' ')
        .trim()}
    >
      <span
        className={[styles.thumb, value ? styles.thumbChecked : '']
          .join(' ')
          .trim()}
      />
    </button>
  );
}
