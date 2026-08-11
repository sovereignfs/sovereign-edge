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
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useTheme } from '../ThemeProvider';

/**
 * Curated Lucide icon set (https://lucide.dev) — the DOM counterpart to
 * `apps/mobile/src/design-system/components/Icon.tsx`, same library
 * (`lucide-react` instead of `lucide-react-native`), same names for the
 * same concepts (mode chips, send/stop, warning banner) — one icon per
 * idea across both platforms, not a per-platform reinterpretation. Same
 * "curated, not the whole library" rule — add a name here only once a
 * screen actually needs it.
 */
const ICONS = {
  'message-circle': MessageCircle,
  cpu: Cpu,
  settings: Settings,
  search: Search,
  lightbulb: Lightbulb,
  'spell-check': SpellCheck,
  'wand-2': Wand2,
  'file-text': FileText,
  send: Send,
  square: Square,
  'alert-triangle': AlertTriangle,
  'chevron-right': ChevronRight,
} as const satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type IconName = keyof typeof ICONS;

/** Binds to the theme's `iconSize` scale (xs/sm/md/lg → 12/16/20/24),
 * matching mobile's own `IconSize`. */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg';

type IconBaseProps = {
  name: IconName;
  size?: IconSize;
  /** Defaults to `currentColor` — unlike React Native's SVG renderer, the
   * DOM one does inherit a surrounding element's `color`, so most call
   * sites don't need to say which theme color they mean explicitly. */
  color?: string;
};

/** Mirrors mobile's `aria-hidden`/`aria-label` contract: exactly one of
 * the two is required, never both, never neither. */
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
  const px = theme.iconSize[size];

  return (
    <LucideIcon
      width={px}
      height={px}
      color={color ?? 'currentColor'}
      strokeWidth={2}
      aria-hidden={hidden ? 'true' : undefined}
      aria-label={hidden ? undefined : ariaLabel}
      role={hidden ? undefined : 'img'}
    />
  );
}
