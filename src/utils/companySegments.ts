import {
  Snowflake, Zap, Sun, Radio, Camera, HardHat, Cog, ArrowUpDown,
  Bot, Sparkles, Bug, Wrench, MoreHorizontal, type LucideIcon,
} from 'lucide-react';

export interface CompanySegment {
  value: string;
  label: string;
  color: string; // hex
  icon: LucideIcon;
}

export const COMPANY_SEGMENTS: CompanySegment[] = [
  { value: 'refrigeracao',     label: 'Refrigeração e Climatização', color: '#06b6d4', icon: Snowflake },
  { value: 'eletrica',         label: 'Instalações Elétricas',       color: '#f59e0b', icon: Zap },
  { value: 'solar',            label: 'Energia Solar',               color: '#eab308', icon: Sun },
  { value: 'telecom',          label: 'Telecomunicações / Provedores', color: '#3b82f6', icon: Radio },
  { value: 'cftv',             label: 'CFTV e Segurança Eletrônica', color: '#6366f1', icon: Camera },
  { value: 'construcao',       label: 'Construção Civil',            color: '#a16207', icon: HardHat },
  { value: 'engenharia',       label: 'Engenharia',                  color: '#0ea5e9', icon: Cog },
  { value: 'elevadores',       label: 'Elevadores',                  color: '#64748b', icon: ArrowUpDown },
  { value: 'automacao',        label: 'Automação Industrial',        color: '#8b5cf6', icon: Bot },
  { value: 'limpeza',          label: 'Limpeza e Conservação',       color: '#10b981', icon: Sparkles },
  { value: 'dedetizacao',      label: 'Dedetização',                 color: '#65a30d', icon: Bug },
  { value: 'manutencao',       label: 'Manutenção Predial',          color: '#ec4899', icon: Wrench },
  { value: 'outro',            label: 'Outro',                       color: '#6b7280', icon: MoreHorizontal },
];

export function getSegment(value: string | null | undefined): CompanySegment | null {
  if (!value) return null;
  return COMPANY_SEGMENTS.find(s => s.value === value) || null;
}
