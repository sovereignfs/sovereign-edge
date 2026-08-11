import styles from './ProgressBar.module.css';

export type ProgressBarProps = {
  /** 0–1. Values outside that range are clamped rather than rejected. */
  progress: number;
};

export function ProgressBar({ progress }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className={styles.track}
    >
      <div className={styles.fill} style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
