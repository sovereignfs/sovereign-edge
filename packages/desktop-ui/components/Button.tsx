import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children'
> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks clicks. Distinct from `disabled`. */
  loading?: boolean;
  fullWidth?: boolean;
};

// `noUncheckedIndexedAccess` treats every CSS-module class lookup as
// possibly `undefined` (the ambient `*.module.css` declaration types it as
// an index signature) — these four/two keys are known to exist in the
// stylesheet right above, so a non-null assertion here is accurate, not a
// suppression of a real gap.
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.variantPrimary!,
  secondary: styles.variantSecondary!,
  ghost: styles.variantGhost!,
  danger: styles.variantDanger!,
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: styles.sizeSm!,
  md: styles.sizeMd!,
};

/**
 * `aria-disabled`/`aria-busy` are not decoration: a screen reader
 * announcing a disabled button as actionable is a bug no visual review
 * catches — same rationale as mobile's own `accessibilityState`. `label`
 * is also always set as `aria-label`, not just visible text, since the
 * loading state replaces the label with a bare spinner.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const inactive = disabled === true || loading;

  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={loading}
      disabled={inactive}
      className={[
        styles.base,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        fullWidth ? styles.fullWidth : '',
      ]
        .join(' ')
        .trim()}
      {...rest}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        <span className={styles.label}>{label}</span>
      )}
    </button>
  );
}
