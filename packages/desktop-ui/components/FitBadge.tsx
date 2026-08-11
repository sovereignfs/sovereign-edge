import styles from './FitBadge.module.css';

/**
 * Maps to how well something fits (a model in memory, a download's
 * progress), not to an arbitrary brand palette — 'tight' means "will fit,
 * but barely", not "in progress". Same variant set and colour mapping as
 * mobile's own `FitBadge` (task 7.6).
 */
export type FitBadgeVariant = 'good' | 'tight' | 'bad' | 'neutral';

export type FitBadgeProps = { label: string; variant: FitBadgeVariant };

const VARIANT_CLASS: Record<FitBadgeVariant, string> = {
  good: styles.good!,
  tight: styles.tight!,
  bad: styles.bad!,
  neutral: styles.neutral!,
};

export function FitBadge({ label, variant }: FitBadgeProps) {
  return (
    <span className={[styles.badge, VARIANT_CLASS[variant]].join(' ')}>
      {label}
    </span>
  );
}
