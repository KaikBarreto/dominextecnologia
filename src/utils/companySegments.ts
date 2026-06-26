import {
  Snowflake, Zap, Sun, Radio, Camera, HardHat, Cog, ArrowUpDown,
  Bot, Sparkles, Bug, Wrench, SprayCan, MoreHorizontal, type LucideIcon,
} from 'lucide-react';

export interface CompanySegment {
  value: string;
  label: string;
  color: string; // hex
  icon: LucideIcon;
  /** Descrição curta exibida nos cards de seleção (ex.: etapa de Segmento do cadastro). Opcional/aditivo. */
  description?: string;
}

export const COMPANY_SEGMENTS: CompanySegment[] = [
  { value: 'refrigeracao',     label: 'Refrigeração e Climatização', color: '#06b6d4', icon: Snowflake,       description: 'Ar condicionado, refrigeração comercial e industrial' },
  { value: 'eletrica',         label: 'Instalações Elétricas',       color: '#f59e0b', icon: Zap,             description: 'Instalação e manutenção elétrica, quadros e projetos' },
  { value: 'solar',            label: 'Energia Solar',               color: '#eab308', icon: Sun,             description: 'Instalação e manutenção de sistemas fotovoltaicos' },
  { value: 'telecom',          label: 'Telecomunicações / Provedores', color: '#3b82f6', icon: Radio,         description: 'Provedores de internet, redes e infraestrutura' },
  { value: 'cftv',             label: 'CFTV e Segurança Eletrônica', color: '#6366f1', icon: Camera,          description: 'Câmeras, alarmes, controle de acesso e monitoramento' },
  { value: 'construcao',       label: 'Construção Civil',            color: '#a16207', icon: HardHat,         description: 'Obras, reformas e serviços de construção' },
  { value: 'engenharia',       label: 'Engenharia',                  color: '#0ea5e9', icon: Cog,             description: 'Projetos, consultoria e laudos técnicos' },
  { value: 'elevadores',       label: 'Elevadores',                  color: '#ef4444', icon: ArrowUpDown,     description: 'Instalação e manutenção de elevadores e escadas' },
  { value: 'automacao',        label: 'Automação Industrial',        color: '#8b5cf6', icon: Bot,             description: 'Painéis, CLPs e automação de processos' },
  { value: 'limpeza',          label: 'Limpeza e Conservação',       color: '#10b981', icon: Sparkles,        description: 'Limpeza predial, conservação e zeladoria' },
  { value: 'dedetizacao',      label: 'Dedetização',                 color: '#65a30d', icon: Bug,             description: 'Controle de pragas e sanitização' },
  { value: 'manutencao',       label: 'Manutenção Predial',          color: '#ec4899', icon: Wrench,          description: 'Manutenção geral, hidráulica e reparos prediais' },
  { value: 'estetica_automotiva', label: 'Estética Automotiva',      color: '#14b8a6', icon: SprayCan,        description: 'Lavagem, polimento, vitrificação e detailing' },
  { value: 'outro',            label: 'Outro',                       color: '#6b7280', icon: MoreHorizontal,  description: 'Personalizar pro seu tipo de negócio' },
];

export function getSegment(value: string | null | undefined): CompanySegment | null {
  if (!value) return null;
  return COMPANY_SEGMENTS.find(s => s.value === value) || null;
}
