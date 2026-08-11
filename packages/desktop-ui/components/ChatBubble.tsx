import styles from './ChatBubble.module.css';
import { Mark } from './Mark';

export type ChatBubbleProps = {
  role: 'user' | 'assistant';
  text: string;
  /**
   * The reply is still being generated. Shows a caret so an empty or
   * part-written message reads as in-progress rather than finished.
   */
  streaming?: boolean;
  /**
   * Name of the connector that produced this reply, when one did.
   *
   * Central to the product's promise, not a nicety: research 0001 requires
   * the UI to show which connector touched the network for a given reply.
   * Absent means the answer came entirely from the local model.
   */
  connector?: string;
};

export function ChatBubble({
  role,
  text,
  streaming = false,
  connector,
}: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    // `role="group"` + one combined `aria-label`, not `role="text"` (not a
    // real ARIA role — mobile's RN `accessibilityRole="text"` has no direct
    // web equivalent) — but the same intent as mobile's own comment: the
    // sender and the message read as one unit, not separate pieces.
    <div
      role="group"
      aria-label={`${isUser ? 'You' : 'Assistant'}: ${text}`}
      className={[
        styles.row,
        isUser ? styles.alignEnd : styles.alignStart,
      ].join(' ')}
    >
      <div className={styles.column}>
        <div
          className={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
          ].join(' ')}
        >
          <p className={styles.text}>
            {text}
            {streaming ? '▌' : ''}
          </p>
        </div>

        {connector ? (
          <div
            className={[
              styles.receipt,
              isUser ? styles.receiptEnd : '',
            ].join(' ')}
            aria-label={`Answered using the ${connector} connector`}
          >
            <Mark size={11} color="var(--sv-color-text-subtle)" />
            <span className={styles.receiptText}>{connector}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
