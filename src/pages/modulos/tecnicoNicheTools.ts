import {
  Power,
  TrendingDown,
  Cable,
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
  Ruler,
  Container,
  Scale,
  Weight,
  ArrowUpDown,
  ClipboardCheck,
  FlaskConical,
  Users,
  Package,
  CalendarClock,
  Droplets,
  type LucideIcon,
} from 'lucide-react';
import { TECH_TOOLS_BY_SEGMENT } from '@/config/technicianArea';

/**
 * Vitrine de ferramentas do técnico POR NICHO, exclusiva da seção de
 * funcionalidades da landing `/area-do-tecnico` (scroll travado + seletor de
 * nicho colorido). NÃO usar em outras páginas de módulo.
 *
 * Chaveado pelo VALUE interno do segmento (refrigeracao, eletrica, solar,
 * telecom, cftv, construcao, elevadores, limpeza, dedetizacao) — os mesmos
 * values de `companySegments.ts`. O seletor pega label/ícone/cor de
 * `getSegment(value)`; aqui guardamos só o mapa value → ferramentas.
 *
 * Refrigeração reusa as ferramentas REAIS do app (`TECH_TOOLS_BY_SEGMENT`),
 * fonte única — label→title, descricao→description, mesmo ícone. Os outros 8
 * nichos ainda não têm ferramenta real implementada: nome/ícone espelham os
 * teasers de `technicianArea.ts` e a descrição é de marketing (PT-BR, plausível).
 */

export interface NicheTool {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Refrigeração: ferramentas REAIS do app (fonte única), não reescrever. */
const refrigeracaoTools: NicheTool[] = (TECH_TOOLS_BY_SEGMENT.refrigeracao ?? []).map(
  (t) => ({ icon: t.icon, title: t.label, description: t.descricao })
);

/**
 * Mapa VALUE do segmento → ferramentas. Refrigeração é o default (primeiro
 * segmento de `getSiteSegments()`).
 */
export const TOOLS_BY_SEGMENT: Record<string, NicheTool[]> = {
  refrigeracao: refrigeracaoTools,
  eletrica: [
    {
      icon: Power,
      title: 'Dimensionamento de Disjuntor',
      description: 'Escolha o disjuntor certo pela corrente do circuito e o tipo de carga.',
    },
    {
      icon: TrendingDown,
      title: 'Queda de Tensão',
      description: 'Calcule a perda de tensão pela distância, bitola e corrente do circuito.',
    },
    {
      icon: Cable,
      title: 'Bitola de Cabo',
      description: 'Defina a seção do cabo pela corrente, tensão e comprimento da linha.',
    },
    {
      icon: Gauge,
      title: 'Carga Instalada',
      description: 'Some a potência dos pontos e dimensione o quadro e a entrada.',
    },
  ],
  solar: [
    {
      icon: Sun,
      title: 'Dimensionamento Fotovoltaico',
      description: 'Calcule a potência do sistema pelo consumo e a irradiação local.',
    },
    {
      icon: LayoutGrid,
      title: 'Nº de Painéis',
      description: 'Descubra quantos módulos cabem pela potência e a área disponível.',
    },
    {
      icon: BarChart3,
      title: 'Geração Mensal',
      description: 'Estime a energia gerada por mês pela potência e a região.',
    },
    {
      icon: Plug,
      title: 'Dimensionar Inversor',
      description: 'Encontre o inversor ideal pela potência dos painéis e o arranjo.',
    },
  ],
  telecom: [
    {
      icon: Radio,
      title: 'Atenuação de Fibra',
      description: 'Calcule a perda do enlace pela distância, emendas e conectores.',
    },
    {
      icon: Activity,
      title: 'Potência Óptica (dBm)',
      description: 'Confira a potência de recepção e a margem do link óptico.',
    },
    {
      icon: RadioTower,
      title: 'Cálculo de Enlace',
      description: 'Dimensione o enlace pela distância, potência e sensibilidade do receptor.',
    },
    {
      icon: Wifi,
      title: 'Banda Necessária',
      description: 'Estime a banda pela quantidade de clientes e o perfil de uso.',
    },
  ],
  cftv: [
    {
      icon: HardDrive,
      title: 'Dimensionamento de HD',
      description: 'Calcule o armazenamento pelas câmeras, resolução e dias de gravação.',
    },
    {
      icon: Video,
      title: 'Banda de Vídeo',
      description: 'Estime a banda do sistema pela resolução e o número de câmeras.',
    },
    {
      icon: Camera,
      title: 'Câmeras por Área',
      description: 'Defina quantas câmeras cobrem o ambiente pelo ângulo e o alcance.',
    },
    {
      icon: BatteryCharging,
      title: 'Fonte/Nobreak',
      description: 'Dimensione a fonte e a autonomia pelo consumo das câmeras.',
    },
  ],
  construcao: [
    {
      icon: Layers,
      title: 'Traço de Concreto',
      description: 'Calcule cimento, areia e brita pelo traço e o volume da peça.',
    },
    {
      icon: Blocks,
      title: 'Blocos/Tijolos',
      description: 'Descubra quantos blocos pela área da parede e o tipo escolhido.',
    },
    {
      icon: Ruler,
      title: 'Área e Volume',
      description: 'Meça áreas e volumes rápido pra orçar material com precisão.',
    },
    {
      icon: Container,
      title: 'Argamassa',
      description: 'Calcule o consumo de argamassa pela área e a espessura.',
    },
  ],
  elevadores: [
    {
      icon: Scale,
      title: 'Cálculo de Contrapeso',
      description: 'Defina o contrapeso pela cabine e a capacidade do elevador.',
    },
    {
      icon: Weight,
      title: 'Capacidade de Carga',
      description: 'Calcule a carga máxima pela área e a norma do equipamento.',
    },
    {
      icon: ArrowUpDown,
      title: 'Velocidade × Pavimentos',
      description: 'Relacione velocidade e nº de pavimentos pro tempo de viagem.',
    },
    {
      icon: ClipboardCheck,
      title: 'Checklist',
      description: 'Roteiro de inspeção e manutenção preventiva do elevador.',
    },
  ],
  limpeza: [
    {
      icon: FlaskConical,
      title: 'Diluição de Produto',
      description: 'Calcule produto + água pela proporção e o volume final.',
    },
    {
      icon: LayoutGrid,
      title: 'Rendimento por Área',
      description: 'Estime o consumo de produto pela área a higienizar.',
    },
    {
      icon: Users,
      title: 'Dimensionar Equipe',
      description: 'Calcule o tamanho da equipe pela área e o tempo de serviço.',
    },
    {
      icon: Package,
      title: 'Material',
      description: 'Liste o material e a quantidade pelo tipo e a frequência da limpeza.',
    },
  ],
  dedetizacao: [
    {
      icon: Droplets,
      title: 'Dosagem por Área',
      description: 'Calcule a dose do produto pela área e a praga alvo.',
    },
    {
      icon: FlaskConical,
      title: 'Diluição',
      description: 'Defina a mistura certa pela concentração e o volume da aplicação.',
    },
    {
      icon: Ruler,
      title: 'Área de Cobertura',
      description: 'Descubra a área coberta por litro pela vazão e a calda.',
    },
    {
      icon: CalendarClock,
      title: 'Reaplicação',
      description: 'Programe o intervalo de reaplicação pela praga e o produto.',
    },
  ],
};
