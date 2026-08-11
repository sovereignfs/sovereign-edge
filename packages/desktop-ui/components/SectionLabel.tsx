import styles from './SectionLabel.module.css';

export type SectionLabelProps = { children: string };

export function SectionLabel({ children }: SectionLabelProps) {
  return <span className={styles.label}>{children.toUpperCase()}</span>;
}
