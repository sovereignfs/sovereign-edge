import { MODES, type ModeId } from './modes';
import styles from './ModeBar.module.css';

/**
 * The writing-assist modes (task 12.8), as a row of chips above the
 * composer — the desktop port of mobile's own `ModeBar`, which likewise
 * lives inside its `ChatScreen.tsx` rather than the design system, since no
 * other screen needs mode chips.
 *
 * `aria-pressed` is the DOM/ARIA equivalent of mobile's
 * `accessibilityState={{selected}}`; `aria-label` matches mobile's exact
 * `"${label} mode"` convention (`"Fix grammar mode"`, `"Search mode"`, etc.)
 * so the two platforms' accessible names agree.
 */
export function ModeBar({
  active,
  onSelect,
}: {
  active: ModeId;
  onSelect: (id: ModeId) => void;
}) {
  return (
    <div className={styles.row} role="group" aria-label="Writing-assist mode">
      {MODES.map((mode) => {
        const selected = mode.id === active;
        return (
          <button
            key={mode.id}
            type="button"
            aria-pressed={selected}
            aria-label={`${mode.label} mode`}
            className={selected ? styles.chipSelected : styles.chip}
            onClick={() => onSelect(mode.id)}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
