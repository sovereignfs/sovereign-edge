import Svg, { Circle, Path } from 'react-native-svg';

export type MarkProps = {
  size?: number;
  color: string;
};

/**
 * The app's own brand mark — not a Lucide icon, so it lives outside
 * `Icon`'s curated set: a sealed boundary ring, opened at exactly one
 * point, with the companion's spark inside. Reused wherever the product
 * needs to say "this crossed the boundary, with permission" — today, the
 * connector-provenance receipt under a chat reply (task 7.5); later, the
 * app icon and splash screen (task 7.8), which is why this is its own
 * small component rather than inlined at the one call site that needs it
 * first.
 */
export function Mark({ size = 24, color }: MarkProps) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none">
      <Path
        d="M14.8 3.98A8.5 8.5 0 1 1 12 3.5"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <Circle cx={18.2} cy={4.6} r={1.6} fill={color} />
      <Path
        d="M12 8.2l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1 1.1-2.7z"
        fill={color}
      />
    </Svg>
  );
}
