import {
  Boxes,
  Thermometer,
  ArrowLeftRight,
  Zap,
  Cable,
  Snowflake,
  Ruler,
  Replace,
  RefreshCcw,
  Power,
  TrendingDown,
  Gauge,
  Sun,
  LayoutGrid,
  BarChart3,
  Plug,
  Radio,
  Activity,
  RadioTower,
  Wifi,
  HardDrive,
  Video,
  Camera,
  BatteryCharging,
  Layers,
  Blocks,
  Container,
  PencilRuler,
  Scale,
  Table,
  Weight,
  ArrowUpDown,
  ClipboardCheck,
  Cpu,
  Wind,
  FlaskConical,
  Users,
  Package,
  Droplets,
  CalendarClock,
  Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Ids das Ferramentas do Técnico. Batem com os `activeTab` do container
 * (`TechnicianTools.tsx`) e com os `ToolNavId` do hub (`Inicio.tsx`).
 * "inicio" (hub) NÃO é uma ferramenta — fica fora desta lista.
 */
export type TechToolId =
  | 'equipamentos'
  | 'carga-termica'
  | 'conversao'
  | 'calculo-capacitor'
  | 'cabo-eletrico'
  | 'superaquecimento'
  | 'regua-gases'
  | 'retrofit-gas'
  | 'ciclo-refrigeracao';

export interface TechTool {
  id: TechToolId;
  /** Rótulo na sidebar/pills e nos cards do Início. */
  label: string;
  /** Descrição curta exibida nos cards do Início. */
  descricao: string;
  icon: LucideIcon;
  /** Cor de destaque (HSL) usada nos cards do Início. */
  accent: string;
}

/**
 * Fonte ÚNICA do conjunto de ferramentas por segmento da empresa.
 * Hoje só `refrigeracao` tem ferramentas. Adicionar um segmento novo aqui
 * faz a feature aparecer sozinha (menu + rota + cards) sem caçar strings.
 *
 * O mapeamento `id → Componente` continua no container (`TechnicianTools.tsx`),
 * pois mistura componentes + deep-link/keys especiais. Este config = só dados.
 */
export const TECH_TOOLS_BY_SEGMENT: Partial<Record<string, TechTool[]>> = {
  refrigeracao: [
    {
      id: 'equipamentos',
      label: 'Catálogo de Equipamentos',
      descricao: 'Consulte modelos, capacidades e códigos de erro.',
      icon: Boxes,
      accent: 'hsl(217 91% 60%)',
    },
    {
      id: 'carga-termica',
      label: 'Carga Térmica',
      descricao: 'Calcule os BTUs ideais para o ambiente.',
      icon: Thermometer,
      accent: 'hsl(0 84% 60%)',
    },
    {
      id: 'conversao',
      label: 'Conversão',
      descricao: 'Converta pressão, temperatura, potência e medidas.',
      icon: ArrowLeftRight,
      accent: 'hsl(142 71% 45%)',
    },
    {
      id: 'calculo-capacitor',
      label: 'Cálculo de Capacitor',
      descricao: 'Encontre o capacitor certo pelo BTU e tensão.',
      icon: Zap,
      accent: 'hsl(38 92% 50%)',
    },
    {
      id: 'cabo-eletrico',
      label: 'Cabo Elétrico',
      descricao: 'Bitola do cabo e disjuntor pelo BTU, tensão e distância.',
      icon: Cable,
      accent: 'hsl(24 95% 53%)',
    },
    {
      id: 'superaquecimento',
      label: 'Superaquecimento',
      descricao: 'Calcule SH e SC pela pressão e temperatura.',
      icon: Snowflake,
      accent: 'hsl(190 90% 42%)',
    },
    {
      id: 'regua-gases',
      label: 'Régua de Gases',
      descricao: 'Pressão de saturação dos gases por temperatura.',
      icon: Ruler,
      accent: 'hsl(262 83% 58%)',
    },
    {
      id: 'retrofit-gas',
      label: 'Retrofit de Gás',
      descricao: 'Gases drop-in para trocar o refrigerante.',
      icon: Replace,
      accent: 'hsl(173 58% 39%)',
    },
    {
      id: 'ciclo-refrigeracao',
      label: 'Ciclo de Refrigeração',
      descricao: 'Entenda o ciclo básico e os termos técnicos.',
      icon: RefreshCcw,
      accent: 'hsl(174 72% 40%)',
    },
  ],
};

/** Ferramentas habilitadas para o segmento dado. Sem segmento → []. */
export function getTechToolsForSegment(segment: string | null | undefined): TechTool[] {
  if (!segment) return [];
  return TECH_TOOLS_BY_SEGMENT[segment] ?? [];
}

/** true se o segmento tem ao menos uma ferramenta (gateia rota e menu). */
export function segmentHasTechTools(segment: string | null | undefined): boolean {
  return getTechToolsForSegment(segment).length > 0;
}

/**
 * Ferramenta-teaser de um nicho BLOQUEADO (vitrine de upsell). NÃO tem componente
 * por trás — clicar nela apenas destaca o item; o conteúdo mostra sempre o gate
 * de bloqueio (`SegmentLockedScreen`). Por isso só carrega rótulo + ícone.
 *
 * Mantida SEPARADA de `TECH_TOOLS_BY_SEGMENT` (ferramentas REAIS com `TechToolId`
 * e componente): `id` aqui é só um slug kebab para key/highlight, não um `TechToolId`.
 */
export interface TeaserTool {
  id: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Catálogo de ferramentas-teaser por nicho. Exibido quando o técnico escolhe no
 * seletor um nicho que a empresa NÃO contratou: mostra a mesma sidebar/pills, mas
 * cada item é só uma prévia (cadeado) e o conteúdo é o gate de upsell.
 *
 * `refrigeracao` NÃO entra aqui (tem ferramentas reais). `outro` também não.
 */
export const TEASER_TOOLS_BY_SEGMENT: Record<string, TeaserTool[]> = {
  eletrica: [
    { id: 'dimensionamento-disjuntor', label: 'Dimensionamento de Disjuntor', icon: Power },
    { id: 'queda-tensao', label: 'Queda de Tensão', icon: TrendingDown },
    { id: 'bitola-cabo', label: 'Bitola de Cabo', icon: Cable },
    { id: 'carga-instalada', label: 'Carga Instalada', icon: Gauge },
  ],
  solar: [
    { id: 'dimensionamento-fotovoltaico', label: 'Dimensionamento Fotovoltaico', icon: Sun },
    { id: 'numero-paineis', label: 'Nº de Painéis', icon: LayoutGrid },
    { id: 'geracao-mensal', label: 'Geração Mensal', icon: BarChart3 },
    { id: 'dimensionar-inversor', label: 'Dimensionar Inversor', icon: Plug },
  ],
  telecom: [
    { id: 'atenuacao-fibra', label: 'Atenuação de Fibra', icon: Radio },
    { id: 'potencia-optica', label: 'Potência Óptica (dBm)', icon: Activity },
    { id: 'calculo-enlace', label: 'Cálculo de Enlace', icon: RadioTower },
    { id: 'banda-necessaria', label: 'Banda Necessária', icon: Wifi },
  ],
  cftv: [
    { id: 'dimensionamento-hd', label: 'Dimensionamento de HD', icon: HardDrive },
    { id: 'banda-video', label: 'Banda de Vídeo', icon: Video },
    { id: 'cameras-por-area', label: 'Câmeras por Área', icon: Camera },
    { id: 'fonte-nobreak', label: 'Fonte/Nobreak', icon: BatteryCharging },
  ],
  construcao: [
    { id: 'traco-concreto', label: 'Traço de Concreto', icon: Layers },
    { id: 'blocos-tijolos', label: 'Blocos/Tijolos', icon: Blocks },
    { id: 'area-volume', label: 'Área e Volume', icon: Ruler },
    { id: 'argamassa', label: 'Argamassa', icon: Container },
  ],
  engenharia: [
    { id: 'conversao-unidades', label: 'Conversão de Unidades', icon: ArrowLeftRight },
    { id: 'calculo-viga', label: 'Cálculo de Viga', icon: PencilRuler },
    { id: 'carga-momento', label: 'Carga e Momento', icon: Scale },
    { id: 'tabela-materiais', label: 'Tabela de Materiais', icon: Table },
  ],
  elevadores: [
    { id: 'calculo-contrapeso', label: 'Cálculo de Contrapeso', icon: Scale },
    { id: 'capacidade-carga', label: 'Capacidade de Carga', icon: Weight },
    { id: 'velocidade-pavimentos', label: 'Velocidade × Pavimentos', icon: ArrowUpDown },
    { id: 'checklist', label: 'Checklist', icon: ClipboardCheck },
  ],
  automacao: [
    { id: 'sinal-4-20ma', label: 'Sinal 4–20 mA', icon: Activity },
    { id: 'dimensionar-clp', label: 'Dimensionar CLP/I/O', icon: Cpu },
    { id: 'calculo-vazao', label: 'Cálculo de Vazão', icon: Gauge },
    { id: 'ar-comprimido', label: 'Ar Comprimido', icon: Wind },
  ],
  limpeza: [
    { id: 'diluicao-produto', label: 'Diluição de Produto', icon: FlaskConical },
    { id: 'rendimento-area', label: 'Rendimento por Área', icon: LayoutGrid },
    { id: 'dimensionar-equipe', label: 'Dimensionar Equipe', icon: Users },
    { id: 'material', label: 'Material', icon: Package },
  ],
  dedetizacao: [
    { id: 'dosagem-area', label: 'Dosagem por Área', icon: Droplets },
    { id: 'diluicao', label: 'Diluição', icon: FlaskConical },
    { id: 'area-cobertura', label: 'Área de Cobertura', icon: Ruler },
    { id: 'reaplicacao', label: 'Reaplicação', icon: CalendarClock },
  ],
  manutencao: [
    { id: 'cronograma-preventivo', label: 'Cronograma Preventivo', icon: CalendarClock },
    { id: 'dimensionar-bomba', label: 'Dimensionar Bomba', icon: Waves },
    { id: 'carga-hidraulica', label: 'Carga Hidráulica', icon: Gauge },
    { id: 'checklist-ativo', label: 'Checklist por Ativo', icon: ClipboardCheck },
  ],
};

/** Ferramentas-teaser do nicho bloqueado. Sem segmento → []. */
export function getTeaserToolsForSegment(segment: string | null | undefined): TeaserTool[] {
  if (!segment) return [];
  return TEASER_TOOLS_BY_SEGMENT[segment] ?? [];
}
