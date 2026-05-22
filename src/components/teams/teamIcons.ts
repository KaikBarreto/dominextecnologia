import {
  UsersRound,
  Wrench,
  Zap,
  Shield,
  Truck,
  Hammer,
  HardHat,
  Settings,
  HeartPulse,
  Flame,
  Droplets,
  Wind,
  Thermometer,
  Cable,
  Plug,
  Lightbulb,
  Gauge,
  type LucideIcon,
} from 'lucide-react';

/**
 * Mapeamento `icon_name` (string salva em `teams.icon_name`) → componente Lucide.
 * Mantido em sync com `ICON_OPTIONS` do `TeamFormDialog`.
 * Fonte única de verdade pra renderizar o ícone da equipe em qualquer tela
 * (lista, leading mobile, etc).
 */
export const TEAM_ICON_MAP: Record<string, LucideIcon> = {
  UsersRound,
  Wrench,
  Zap,
  Shield,
  Truck,
  Hammer,
  HardHat,
  Settings,
  HeartPulse,
  Flame,
  Droplets,
  Wind,
  Thermometer,
  Cable,
  Plug,
  Lightbulb,
  Gauge,
};

/**
 * Resolve o ícone a partir do `icon_name`. Cai em `UsersRound` se não encontrar
 * (ex: registro antigo sem icon_name ou nome novo ainda não mapeado).
 */
export function getTeamIcon(iconName?: string | null): LucideIcon {
  if (!iconName) return UsersRound;
  return TEAM_ICON_MAP[iconName] ?? UsersRound;
}
