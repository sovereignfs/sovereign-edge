import type { ReactNode } from 'react';
import styles from './ListItem.module.css';

export type ListItemProps = {
  title: string;
  subtitle?: string;
  /** Trailing control — a Toggle, a chevron, a size label. */
  accessory?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Renders title in the error colour. */
  destructive?: boolean;
};

export function ListItem({
  title,
  subtitle,
  accessory,
  onClick,
  disabled = false,
  destructive = false,
}: ListItemProps) {
  const body = (
    <>
      <div className={styles.textCol}>
        <p
          className={[styles.title, destructive ? styles.titleDestructive : '']
            .join(' ')
            .trim()}
        >
          {title}
        </p>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {accessory}
    </>
  );

  const rowClass = [styles.row, disabled ? styles.rowDisabled : '']
    .join(' ')
    .trim();

  // A non-interactive row must not be announced as a button, so no
  // <button> is rendered at all when there's no onClick — mobile's own
  // rationale: "a non-pressable row must not be announced as a button, so
  // the Pressable is omitted entirely rather than disabled."
  if (!onClick) {
    return <div className={rowClass}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[rowClass, styles.button].join(' ')}
    >
      {body}
    </button>
  );
}
