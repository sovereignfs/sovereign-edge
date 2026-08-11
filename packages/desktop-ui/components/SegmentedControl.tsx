import styles from './SegmentedControl.module.css';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
};

/**
 * A real mutually-exclusive control for a small, fixed set of options —
 * replacing the previous pattern of a plain `role="radiogroup"` of styled
 * buttons, which every screen that needed one (`SettingsScreen.tsx`'s
 * theme picker, `SearchSetupScreen.tsx`'s provider picker) was hand-rolling
 * on its own. Same component shape as mobile's own `SegmentedControl`
 * (task 7.7).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={styles.track}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={[styles.segment, active ? styles.segmentActive : '']
              .join(' ')
              .trim()}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
