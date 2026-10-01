// ─────────────────────────────────────────────────────────────────────────────
// processIcons — catálogo de ícones que o usuário escolhe por etapa.
//
// Mora aqui, e não em `lib/flowchart/shapes.ts`, porque aquele módulo é PURO
// (testado em node, sem React/lucide). A regra "forma → ícone padrão" e o
// catálogo de escolha são apresentação.
//
// A chave gravada em `ProcessNodeData.icon` é a string do `Record` abaixo —
// NUNCA o componente. Chave desconhecida (ícone removido numa versão futura)
// cai no ícone padrão da forma, sem quebrar o desenho salvo.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Play, Square, GitFork, Layers, FileText, Clock, StickyNote, ListChecks,
  Wrench, Snowflake, Wind, Gauge, Plug, Hammer, Truck, Package,
  ClipboardCheck, Phone, MessageSquare, Mail, Calendar, Camera, PenLine,
  DollarSign, CreditCard, User, Users, MapPin, TriangleAlert, CheckCheck,
  Search, Star, ShieldCheck, Thermometer, Droplets, Flame, Zap, Settings,
  Building2, Receipt, Ruler, Fan,
} from 'lucide-react';
import type { ProcessShape } from '@/lib/flowchart/shapes';

export type ProcessIconKey = string;

/** Catálogo escolhível. Ordem = ordem de exibição no seletor. */
export const PROCESS_ICONS = {
  checklist: ListChecks,
  clipboard: ClipboardCheck,
  wrench: Wrench,
  hammer: Hammer,
  ruler: Ruler,
  gauge: Gauge,
  thermometer: Thermometer,
  snowflake: Snowflake,
  wind: Wind,
  fan: Fan,
  droplets: Droplets,
  flame: Flame,
  plug: Plug,
  zap: Zap,
  package: Package,
  truck: Truck,
  building: Building2,
  mapPin: MapPin,
  calendar: Calendar,
  clock: Clock,
  phone: Phone,
  message: MessageSquare,
  mail: Mail,
  camera: Camera,
  signature: PenLine,
  document: FileText,
  receipt: Receipt,
  money: DollarSign,
  card: CreditCard,
  user: User,
  users: Users,
  search: Search,
  alert: TriangleAlert,
  check: CheckCheck,
  shield: ShieldCheck,
  star: Star,
  settings: Settings,
  note: StickyNote,
} as const;

export const PROCESS_ICON_KEYS = Object.keys(PROCESS_ICONS) as ProcessIconKey[];

// Formas com ícone INTRÍNSECO: trocar o ícone do losango por um relógio não
// ajuda ninguém a ler o fluxo, então essas quatro não são personalizáveis.
const INTRINSIC: Partial<Record<ProcessShape, typeof Play>> = {
  start: Play,
  end: Square,
  decision: GitFork,
  subprocess: Layers,
};

/** Ícone padrão das formas personalizáveis, quando o usuário não escolheu. */
const SHAPE_DEFAULT: Partial<Record<ProcessShape, keyof typeof PROCESS_ICONS>> = {
  task: 'checklist',
  document: 'document',
  delay: 'clock',
  note: 'note',
};

/** true quando a forma aceita ícone escolhido pelo usuário. */
export function shapeAcceptsCustomIcon(shape: ProcessShape): boolean {
  return !(shape in INTRINSIC);
}

/** Resolve o ícone a desenhar: escolha do usuário → padrão da forma. */
export function resolveProcessIcon(shape: ProcessShape, iconKey?: string) {
  const intrinsic = INTRINSIC[shape];
  if (intrinsic) return intrinsic;
  if (iconKey && iconKey in PROCESS_ICONS) {
    return PROCESS_ICONS[iconKey as keyof typeof PROCESS_ICONS];
  }
  return PROCESS_ICONS[SHAPE_DEFAULT[shape] ?? 'checklist'];
}

/**
 * Cor de acento por forma — é o que dá ritmo visual ao desenho e deixa a forma
 * reconhecível de longe, mesmo sem ler o rótulo. Sobrescrita por `data.color`.
 */
export const SHAPE_ACCENT: Record<ProcessShape, string> = {
  start: '#16A34A',
  end: '#DC2626',
  task: '#0EA5E9',
  decision: '#F59E0B',
  subprocess: '#8B5CF6',
  document: '#3B82F6',
  delay: '#F97316',
  note: '#D97706',
};
