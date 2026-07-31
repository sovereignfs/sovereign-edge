import { Switch } from 'react-native';

export type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/**
 * Wraps the platform Switch rather than reimplementing it.
 *
 * A hand-rolled toggle would match Sovereign's web look more closely, but it
 * would also lose the platform's gesture handling, accessibility semantics,
 * and reduced-motion behaviour. Those are worth more than exact visual parity
 * on a control this small.
 *
 * **Deliberately untinted.** Two attempts to colour it from the theme both
 * made it worse in dark mode: Android alpha-blends `trackColor`, which turned
 * the near-white `accent` track invisible against a dark background, and it
 * does not reliably honour `thumbColor` under Material theming — leaving a
 * white thumb on an invisible track. The platform's own dark-mode switch
 * colours are already designed to be legible, so the theme stays out of it.
 *
 * The cost is that this one control does not carry the monochrome identity.
 * If that becomes unacceptable, the fix is a custom Pressable-based toggle
 * that owns its own rendering — not more props on this one.
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
}: ToggleProps) {
  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
