import {
  ClipboardCheck,
  Droplets,
  Fan,
  Flame,
  Gauge,
  ListChecks,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Thermometer,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const DEFAULT_CHECKLIST_COLOR = '#0F766E';
export const DEFAULT_CHECKLIST_ICON = 'clipboard-check';

export const CHECKLIST_ICON_OPTIONS: Array<{
  value: string;
  label: string;
  icon: LucideIcon;
}> = [
  { value: 'clipboard-check', label: 'Checklist', icon: ClipboardCheck },
  { value: 'list-checks', label: 'Lista', icon: ListChecks },
  { value: 'wrench', label: 'Manutenção', icon: Wrench },
  { value: 'shield-check', label: 'Conformidade', icon: ShieldCheck },
  { value: 'snowflake', label: 'Refrigeração', icon: Snowflake },
  { value: 'fan', label: 'Ventilação', icon: Fan },
  { value: 'thermometer', label: 'Temperatura', icon: Thermometer },
  { value: 'gauge', label: 'Medição', icon: Gauge },
  { value: 'droplets', label: 'Hidráulica', icon: Droplets },
  { value: 'zap', label: 'Elétrica', icon: Zap },
  { value: 'flame', label: 'Aquecimento', icon: Flame },
  { value: 'sparkles', label: 'Higienização', icon: Sparkles },
];

const CHECKLIST_ICON_MAP = new Map(
  CHECKLIST_ICON_OPTIONS.map((option) => [option.value, option.icon]),
);

export function normalizeChecklistColor(color?: string | null): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : DEFAULT_CHECKLIST_COLOR;
}

export function normalizeChecklistIcon(icon?: string | null): string {
  return icon && CHECKLIST_ICON_MAP.has(icon) ? icon : DEFAULT_CHECKLIST_ICON;
}

export function getChecklistIcon(icon?: string | null): LucideIcon {
  return CHECKLIST_ICON_MAP.get(normalizeChecklistIcon(icon)) ?? ClipboardCheck;
}
