import {
  AlertTriangle,
  ChevronRight,
  Cpu,
  FileText,
  Lightbulb,
  MessageCircle,
  Search,
  Send,
  Settings,
  SpellCheck,
  Square,
  Wand2,
  WifiOff,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

import { useTheme } from '../ThemeProvider';

/**
 * Curated Lucide icon set (https://lucide.dev) — the same icon library and
 * visual language `sovereign` uses (`docs/design-system.md`'s Icon system,
 * RFC 0011), MIT/ISC licensed. `sovereign` ships zero-runtime-dependency
 * inline SVGs generated at build time from a curated list; that specific
 * mechanism is web/RSC-specific (its published package carries no icon
 * dependency at all) and doesn't carry over to React Native, which has no
 * equivalent static-generation step and needs `react-native-svg` as a
 * runtime SVG renderer regardless of how the icon paths get there. So this
 * wraps the official `lucide-react-native` package — same path data, same
 * stroke conventions — instead of hand-porting individual icon paths.
 *
 * The set is intentionally small, matching Sovereign's own "curated, not
 * the whole library" rule — add a name here only once a screen actually
 * needs it.
 */
const ICONS = {
  'message-circle': MessageCircle,
  cpu: Cpu,
  settings: Settings,
  search: Search,
  'wifi-off': WifiOff,
  'alert-triangle': AlertTriangle,
  lightbulb: Lightbulb,
  'spell-check': SpellCheck,
  'wand-2': Wand2,
  'file-text': FileText,
  send: Send,
  square: Square,
  'chevron-right': ChevronRight,
} as const satisfies Record<string, ComponentType<SvgProps>>;

export type IconName = keyof typeof ICONS;

/** Binds to the theme's `iconSize` scale (xs/sm/md/lg → 12/16/20/24),
 * matching Sovereign's own `--sv-icon-size-*` tokens. */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg';

type IconBaseProps = {
  name: IconName;
  size?: IconSize;
  /**
   * Required, not defaulted or inherited: unlike CSS's `currentColor`,
   * React Native's SVG renderer has no way to pick up a surrounding
   * `Text`'s color, so every call site must say which theme color it means.
   */
  color: string;
};

/**
 * Mirrors Sovereign's own `<Icon>` contract (`aria-hidden` for decorative
 * use, `aria-label` for a meaningful standalone affordance) — exactly one
 * of the two is required, never both, never neither.
 */
export type IconProps = IconBaseProps &
  (
    | { 'aria-hidden': true; 'aria-label'?: never }
    | { 'aria-label': string; 'aria-hidden'?: never }
  );

export function Icon({
  name,
  size = 'md',
  color,
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
}: IconProps) {
  const theme = useTheme();
  const LucideIcon = ICONS[name];
  const hidden = ariaHidden === true;

  return (
    <LucideIcon
      width={theme.iconSize[size]}
      height={theme.iconSize[size]}
      color={color}
      strokeWidth={2}
      accessible={!hidden}
      accessibilityLabel={hidden ? undefined : ariaLabel}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'yes'}
    />
  );
}
