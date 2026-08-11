import { Icon, type IconName } from 'desktop-ui';
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

// Same icon per mode as mobile's own `MODE_ICON` (task 7.5) — one mapping
// from concept to glyph, not a per-platform reinterpretation.
const MODE_ICON: Record<ModeId, IconName> = {
  plain: 'message-circle',
  search: 'search',
  brainstorm: 'lightbulb',
  grammar: 'spell-check',
  tone: 'wand-2',
  draft: 'file-text',
};

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
            <Icon name={MODE_ICON[mode.id]} size="xs" aria-hidden />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
