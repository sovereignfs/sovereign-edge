import { useId, useState, type InputHTMLAttributes } from 'react';
import { useTheme } from '../ThemeProvider';
import styles from './TextField.module.css';

export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className'
> & {
  label?: string;
  /** Shown below the field and announced to screen readers. */
  error?: string;
  /** Shown below the field when there is no error. */
  hint?: string;
  containerClassName?: string;
};

export function TextField({
  label,
  error,
  hint,
  containerClassName,
  disabled,
  onFocus,
  onBlur,
  id,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const invalid = Boolean(error);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  // Focus wins over error for the border: the user is acting on the field
  // right now, and the message below still carries the error.
  const borderColor = invalid
    ? theme.colors.errorBorder
    : focused
      ? theme.colors.focusRing
      : theme.colors.border;

  return (
    <div
      className={[styles.container, containerClassName]
        .filter(Boolean)
        .join(' ')}
    >
      {label ? (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      ) : null}

      <input
        id={inputId}
        // Without this a screen reader reads the field as valid while the
        // error text sits visibly underneath it.
        aria-invalid={invalid}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={styles.input}
        style={{ borderColor }}
        {...rest}
      />

      {invalid || hint ? (
        <p
          className={[
            styles.message,
            invalid ? styles.messageError : styles.messageHint,
          ].join(' ')}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
