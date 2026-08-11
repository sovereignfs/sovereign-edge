/**
 * The "one gate" mark — a sealed ring opened at exactly one point, a dot
 * at the threshold (the permissioned connector), the spark of the
 * companion inside. Same path data as `apps/mobile/src/design-system/
 * components/Mark.tsx` and `packages/design-tokens/reference.html`'s own
 * splash/nav usage — this is the one glyph, not a per-platform redraw.
 */
export type MarkProps = {
  size?: number;
  color?: string;
};

export function Mark({ size = 24, color = 'currentColor' }: MarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14.8 3.98A8.5 8.5 0 1 1 12 3.5"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <circle cx={18.2} cy={4.6} r={1.6} fill={color} />
      <path
        d="M12 8.2l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1 1.1-2.7z"
        fill={color}
      />
    </svg>
  );
}
