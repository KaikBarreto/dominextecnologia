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
import type { LocaleCode } from '@/lib/i18n';

/**
 * Vitrine de ferramentas do técnico POR NICHO, exclusiva da seção de
 * funcionalidades da landing `/area-do-tecnico` (scroll travado + seletor de
 * nicho colorido). NÃO usar em outras páginas de módulo.
 *
 * Chaveado pelo VALUE interno do segmento (refrigeracao, eletrica, solar,
 * telecom, cftv, construcao, elevadores, limpeza, dedetizacao, ti_assistencia) — os mesmos
 * values de `companySegments.ts`. O seletor pega label/ícone/cor de
 * `getSegment(value)`; aqui guardamos só o mapa value → ferramentas.
 *
 * Refrigeração e assistência técnica reusam as ferramentas REAIS do app
 * (`TECH_TOOLS_BY_SEGMENT`), fonte única — label→title,
 * descricao→description, mesmo ícone. Os outros nichos ainda não têm ferramenta
 * real implementada: nome/ícone espelham os teasers de `technicianArea.ts` e a
 * descrição é de marketing (PT-BR, plausível).
 */

export interface NicheTool {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Refrigeração: ferramentas REAIS do app (fonte única), não reescrever. */
const refrigeracaoTools: NicheTool[] = (TECH_TOOLS_BY_SEGMENT.refrigeracao ?? []).map(
  (t) => ({ id: t.id, icon: t.icon, title: t.label, description: t.descricao })
);

/** Assistência técnica: ferramentas REAIS do app (fonte única), não reescrever. */
const tiAssistenciaTools: NicheTool[] = (TECH_TOOLS_BY_SEGMENT.ti_assistencia ?? []).map(
  (t) => ({ id: t.id, icon: t.icon, title: t.label, description: t.descricao })
);

/**
 * Mapa VALUE do segmento → ferramentas. Refrigeração é o default (primeiro
 * segmento de `getSiteSegments()`).
 */
export const TOOLS_BY_SEGMENT: Record<string, NicheTool[]> = {
  refrigeracao: refrigeracaoTools,
  eletrica: [
    {
      id: 'dimensionamento-disjuntor',
      icon: Power,
      title: 'Dimensionamento de Disjuntor',
      description: 'Escolha o disjuntor certo pela corrente do circuito e o tipo de carga.',
    },
    {
      id: 'queda-tensao',
      icon: TrendingDown,
      title: 'Queda de Tensão',
      description: 'Calcule a perda de tensão pela distância, bitola e corrente do circuito.',
    },
    {
      id: 'bitola-cabo',
      icon: Cable,
      title: 'Bitola de Cabo',
      description: 'Defina a seção do cabo pela corrente, tensão e comprimento da linha.',
    },
    {
      id: 'carga-instalada',
      icon: Gauge,
      title: 'Carga Instalada',
      description: 'Some a potência dos pontos e dimensione o quadro e a entrada.',
    },
  ],
  solar: [
    {
      id: 'dimensionamento-fotovoltaico',
      icon: Sun,
      title: 'Dimensionamento Fotovoltaico',
      description: 'Calcule a potência do sistema pelo consumo e a irradiação local.',
    },
    {
      id: 'numero-paineis',
      icon: LayoutGrid,
      title: 'Nº de Painéis',
      description: 'Descubra quantos módulos cabem pela potência e a área disponível.',
    },
    {
      id: 'geracao-mensal',
      icon: BarChart3,
      title: 'Geração Mensal',
      description: 'Estime a energia gerada por mês pela potência e a região.',
    },
    {
      id: 'dimensionar-inversor',
      icon: Plug,
      title: 'Dimensionar Inversor',
      description: 'Encontre o inversor ideal pela potência dos painéis e o arranjo.',
    },
  ],
  telecom: [
    {
      id: 'atenuacao-fibra',
      icon: Radio,
      title: 'Atenuação de Fibra',
      description: 'Calcule a perda do enlace pela distância, emendas e conectores.',
    },
    {
      id: 'potencia-optica',
      icon: Activity,
      title: 'Potência Óptica (dBm)',
      description: 'Confira a potência de recepção e a margem do link óptico.',
    },
    {
      id: 'calculo-enlace',
      icon: RadioTower,
      title: 'Cálculo de Enlace',
      description: 'Dimensione o enlace pela distância, potência e sensibilidade do receptor.',
    },
    {
      id: 'banda-necessaria',
      icon: Wifi,
      title: 'Banda Necessária',
      description: 'Estime a banda pela quantidade de clientes e o perfil de uso.',
    },
  ],
  cftv: [
    {
      id: 'dimensionamento-hd',
      icon: HardDrive,
      title: 'Dimensionamento de HD',
      description: 'Calcule o armazenamento pelas câmeras, resolução e dias de gravação.',
    },
    {
      id: 'banda-video',
      icon: Video,
      title: 'Banda de Vídeo',
      description: 'Estime a banda do sistema pela resolução e o número de câmeras.',
    },
    {
      id: 'cameras-area',
      icon: Camera,
      title: 'Câmeras por Área',
      description: 'Defina quantas câmeras cobrem o ambiente pelo ângulo e o alcance.',
    },
    {
      id: 'fonte-nobreak',
      icon: BatteryCharging,
      title: 'Fonte/Nobreak',
      description: 'Dimensione a fonte e a autonomia pelo consumo das câmeras.',
    },
  ],
  construcao: [
    {
      id: 'traco-concreto',
      icon: Layers,
      title: 'Traço de Concreto',
      description: 'Calcule cimento, areia e brita pelo traço e o volume da peça.',
    },
    {
      id: 'blocos-tijolos',
      icon: Blocks,
      title: 'Blocos/Tijolos',
      description: 'Descubra quantos blocos pela área da parede e o tipo escolhido.',
    },
    {
      id: 'area-volume',
      icon: Ruler,
      title: 'Área e Volume',
      description: 'Meça áreas e volumes rápido pra orçar material com precisão.',
    },
    {
      id: 'argamassa',
      icon: Container,
      title: 'Argamassa',
      description: 'Calcule o consumo de argamassa pela área e a espessura.',
    },
  ],
  elevadores: [
    {
      id: 'calculo-contrapeso',
      icon: Scale,
      title: 'Cálculo de Contrapeso',
      description: 'Defina o contrapeso pela cabine e a capacidade do elevador.',
    },
    {
      id: 'capacidade-carga',
      icon: Weight,
      title: 'Capacidade de Carga',
      description: 'Calcule a carga máxima pela área e a norma do equipamento.',
    },
    {
      id: 'velocidade-pavimentos',
      icon: ArrowUpDown,
      title: 'Velocidade × Pavimentos',
      description: 'Relacione velocidade e nº de pavimentos pro tempo de viagem.',
    },
    {
      id: 'checklist-elevador',
      icon: ClipboardCheck,
      title: 'Checklist',
      description: 'Roteiro de inspeção e manutenção preventiva do elevador.',
    },
  ],
  limpeza: [
    {
      id: 'diluicao-limpeza',
      icon: FlaskConical,
      title: 'Diluição de Produto',
      description: 'Calcule produto + água pela proporção e o volume final.',
    },
    {
      id: 'rendimento-area',
      icon: LayoutGrid,
      title: 'Rendimento por Área',
      description: 'Estime o consumo de produto pela área a higienizar.',
    },
    {
      id: 'dimensionar-equipe',
      icon: Users,
      title: 'Dimensionar Equipe',
      description: 'Calcule o tamanho da equipe pela área e o tempo de serviço.',
    },
    {
      id: 'material-limpeza',
      icon: Package,
      title: 'Material',
      description: 'Liste o material e a quantidade pelo tipo e a frequência da limpeza.',
    },
  ],
  dedetizacao: [
    {
      id: 'dosagem-area',
      icon: Droplets,
      title: 'Dosagem por Área',
      description: 'Calcule a dose do produto pela área e a praga alvo.',
    },
    {
      id: 'diluicao-dedetizacao',
      icon: FlaskConical,
      title: 'Diluição',
      description: 'Defina a mistura certa pela concentração e o volume da aplicação.',
    },
    {
      id: 'area-cobertura',
      icon: Ruler,
      title: 'Área de Cobertura',
      description: 'Descubra a área coberta por litro pela vazão e a calda.',
    },
    {
      id: 'reaplicacao',
      icon: CalendarClock,
      title: 'Reaplicação',
      description: 'Programe o intervalo de reaplicação pela praga e o produto.',
    },
  ],
  ti_assistencia: tiAssistenciaTools,
};

type NicheToolCopy = Pick<NicheTool, 'title' | 'description'>;

const NICHE_TOOL_TRANSLATIONS: Partial<
  Record<LocaleCode, Record<string, NicheToolCopy>>
> = {
  en: {
    'dimensionamento-disjuntor': { title: 'Breaker Sizing', description: 'Choose the right breaker from circuit current and load type.' },
    'queda-tensao': { title: 'Voltage Drop', description: 'Calculate voltage loss from distance, wire gauge and circuit current.' },
    'bitola-cabo': { title: 'Wire Gauge', description: 'Size the wire from current, voltage and run length.' },
    'carga-instalada': { title: 'Connected Load', description: 'Add each load to size the panel and service entrance.' },
    'dimensionamento-fotovoltaico': { title: 'PV System Sizing', description: 'Calculate system power from consumption and local solar irradiation.' },
    'numero-paineis': { title: 'Panel Count', description: 'Find how many modules fit the target power and available area.' },
    'geracao-mensal': { title: 'Monthly Generation', description: 'Estimate monthly energy generation from system power and location.' },
    'dimensionar-inversor': { title: 'Inverter Sizing', description: 'Find the right inverter for the array power and layout.' },
    'atenuacao-fibra': { title: 'Fiber Attenuation', description: 'Calculate link loss from distance, splices and connectors.' },
    'potencia-optica': { title: 'Optical Power (dBm)', description: 'Check receive power and optical link margin.' },
    'calculo-enlace': { title: 'Link Budget', description: 'Size the link from distance, transmit power and receiver sensitivity.' },
    'banda-necessaria': { title: 'Required Bandwidth', description: 'Estimate bandwidth from customer count and usage profile.' },
    'dimensionamento-hd': { title: 'Storage Sizing', description: 'Calculate storage from camera count, resolution and retention days.' },
    'banda-video': { title: 'Video Bandwidth', description: 'Estimate system bandwidth from resolution and camera count.' },
    'cameras-area': { title: 'Cameras per Area', description: 'Define camera count from viewing angle and coverage distance.' },
    'fonte-nobreak': { title: 'Power Supply / UPS', description: 'Size the power supply and backup time from camera consumption.' },
    'traco-concreto': { title: 'Concrete Mix', description: 'Calculate cement, sand and aggregate from mix ratio and volume.' },
    'blocos-tijolos': { title: 'Blocks / Bricks', description: 'Calculate units from wall area and the selected block type.' },
    'area-volume': { title: 'Area and Volume', description: 'Measure areas and volumes quickly for accurate material estimates.' },
    argamassa: { title: 'Mortar', description: 'Calculate mortar consumption from area and layer thickness.' },
    'calculo-contrapeso': { title: 'Counterweight Calculation', description: 'Size the counterweight from cabin weight and elevator capacity.' },
    'capacidade-carga': { title: 'Load Capacity', description: 'Calculate maximum load from floor area and equipment standard.' },
    'velocidade-pavimentos': { title: 'Speed × Floors', description: 'Relate speed and floor count to estimate travel time.' },
    'checklist-elevador': { title: 'Inspection Checklist', description: 'A guided elevator inspection and preventive maintenance routine.' },
    'diluicao-limpeza': { title: 'Product Dilution', description: 'Calculate product and water from ratio and final volume.' },
    'rendimento-area': { title: 'Coverage per Area', description: 'Estimate product consumption from the area to be cleaned.' },
    'dimensionar-equipe': { title: 'Crew Sizing', description: 'Calculate crew size from area and expected service time.' },
    'material-limpeza': { title: 'Materials', description: 'List materials and quantities from cleaning type and frequency.' },
    'dosagem-area': { title: 'Dosage per Area', description: 'Calculate product dosage from area and target pest.' },
    'diluicao-dedetizacao': { title: 'Dilution', description: 'Set the correct mix from concentration and application volume.' },
    'area-cobertura': { title: 'Coverage Area', description: 'Find coverage per litre from flow rate and spray mix.' },
    reaplicacao: { title: 'Reapplication', description: 'Plan the reapplication interval from pest and product.' },
  },
  es: {
    'dimensionamento-disjuntor': { title: 'Dimensionamiento de Disyuntor', description: 'Elige el disyuntor correcto según la corriente y el tipo de carga.' },
    'queda-tensao': { title: 'Caída de Tensión', description: 'Calcula la pérdida según distancia, calibre y corriente del circuito.' },
    'bitola-cabo': { title: 'Calibre de Cable', description: 'Define la sección del cable según corriente, tensión y longitud.' },
    'carga-instalada': { title: 'Carga Instalada', description: 'Suma las potencias para dimensionar el tablero y la acometida.' },
    'dimensionamento-fotovoltaico': { title: 'Dimensionamiento Fotovoltaico', description: 'Calcula la potencia del sistema según consumo e irradiación local.' },
    'numero-paineis': { title: 'Número de Paneles', description: 'Descubre cuántos módulos caben según potencia y área disponible.' },
    'geracao-mensal': { title: 'Generación Mensual', description: 'Estima la energía mensual según potencia y región.' },
    'dimensionar-inversor': { title: 'Dimensionar Inversor', description: 'Encuentra el inversor ideal según la potencia y el arreglo.' },
    'atenuacao-fibra': { title: 'Atenuación de Fibra', description: 'Calcula la pérdida del enlace por distancia, empalmes y conectores.' },
    'potencia-optica': { title: 'Potencia Óptica (dBm)', description: 'Comprueba la potencia de recepción y el margen del enlace.' },
    'calculo-enlace': { title: 'Cálculo de Enlace', description: 'Dimensiona el enlace por distancia, potencia y sensibilidad.' },
    'banda-necessaria': { title: 'Ancho de Banda Necesario', description: 'Estima el ancho de banda según clientes y perfil de uso.' },
    'dimensionamento-hd': { title: 'Dimensionamiento de Almacenamiento', description: 'Calcula el espacio según cámaras, resolución y días de grabación.' },
    'banda-video': { title: 'Ancho de Banda de Video', description: 'Estima el ancho de banda por resolución y número de cámaras.' },
    'cameras-area': { title: 'Cámaras por Área', description: 'Define cuántas cámaras cubren el ambiente según ángulo y alcance.' },
    'fonte-nobreak': { title: 'Fuente / UPS', description: 'Dimensiona la fuente y la autonomía según el consumo.' },
    'traco-concreto': { title: 'Dosificación de Hormigón', description: 'Calcula cemento, arena y grava según dosificación y volumen.' },
    'blocos-tijolos': { title: 'Bloques / Ladrillos', description: 'Calcula las unidades según el área y el tipo seleccionado.' },
    'area-volume': { title: 'Área y Volumen', description: 'Mide áreas y volúmenes para presupuestar materiales con precisión.' },
    argamassa: { title: 'Mortero', description: 'Calcula el consumo según el área y el espesor.' },
    'calculo-contrapeso': { title: 'Cálculo de Contrapeso', description: 'Define el contrapeso según cabina y capacidad del ascensor.' },
    'capacidade-carga': { title: 'Capacidad de Carga', description: 'Calcula la carga máxima según el área y la norma.' },
    'velocidade-pavimentos': { title: 'Velocidad × Plantas', description: 'Relaciona velocidad y plantas para estimar el tiempo de viaje.' },
    'checklist-elevador': { title: 'Checklist de Inspección', description: 'Rutina guiada de inspección y mantenimiento preventivo.' },
    'diluicao-limpeza': { title: 'Dilución de Producto', description: 'Calcula producto y agua según proporción y volumen final.' },
    'rendimento-area': { title: 'Rendimiento por Área', description: 'Estima el consumo según el área que se va a limpiar.' },
    'dimensionar-equipe': { title: 'Dimensionar Equipo', description: 'Calcula el tamaño del equipo según área y tiempo de servicio.' },
    'material-limpeza': { title: 'Materiales', description: 'Lista materiales y cantidades según tipo y frecuencia.' },
    'dosagem-area': { title: 'Dosificación por Área', description: 'Calcula la dosis según el área y la plaga objetivo.' },
    'diluicao-dedetizacao': { title: 'Dilución', description: 'Define la mezcla correcta según concentración y volumen.' },
    'area-cobertura': { title: 'Área de Cobertura', description: 'Calcula la cobertura por litro según caudal y mezcla.' },
    reaplicacao: { title: 'Reaplicación', description: 'Programa el intervalo según la plaga y el producto.' },
  },
  fr: {
    'dimensionamento-disjuntor': { title: 'Dimensionnement du disjoncteur', description: 'Choisissez le disjoncteur selon le courant et le type de charge.' },
    'queda-tensao': { title: 'Chute de tension', description: 'Calculez la perte selon la distance, la section et le courant.' },
    'bitola-cabo': { title: 'Section de câble', description: 'Définissez la section selon le courant, la tension et la longueur.' },
    'carga-instalada': { title: 'Charge installée', description: 'Additionnez les puissances pour dimensionner le tableau et l’arrivée.' },
    'dimensionamento-fotovoltaico': { title: 'Dimensionnement photovoltaïque', description: 'Calculez la puissance selon la consommation et l’ensoleillement.' },
    'numero-paineis': { title: 'Nombre de panneaux', description: 'Déterminez le nombre de modules selon la puissance et la surface.' },
    'geracao-mensal': { title: 'Production mensuelle', description: 'Estimez l’énergie mensuelle selon la puissance et la région.' },
    'dimensionar-inversor': { title: 'Dimensionnement de l’onduleur', description: 'Trouvez l’onduleur adapté à la puissance et au montage.' },
    'atenuacao-fibra': { title: 'Atténuation de la fibre', description: 'Calculez la perte selon la distance, les soudures et connecteurs.' },
    'potencia-optica': { title: 'Puissance optique (dBm)', description: 'Contrôlez la puissance reçue et la marge de la liaison.' },
    'calculo-enlace': { title: 'Budget de liaison', description: 'Dimensionnez la liaison selon distance, puissance et sensibilité.' },
    'banda-necessaria': { title: 'Bande passante nécessaire', description: 'Estimez la bande passante selon les clients et leurs usages.' },
    'dimensionamento-hd': { title: 'Dimensionnement du stockage', description: 'Calculez le stockage selon les caméras, la résolution et la durée.' },
    'banda-video': { title: 'Bande passante vidéo', description: 'Estimez la bande passante selon la résolution et les caméras.' },
    'cameras-area': { title: 'Caméras par zone', description: 'Définissez le nombre de caméras selon l’angle et la portée.' },
    'fonte-nobreak': { title: 'Alimentation / Onduleur', description: 'Dimensionnez l’alimentation et l’autonomie selon la consommation.' },
    'traco-concreto': { title: 'Dosage du béton', description: 'Calculez ciment, sable et granulats selon dosage et volume.' },
    'blocos-tijolos': { title: 'Blocs / Briques', description: 'Calculez les unités selon la surface et le type choisi.' },
    'area-volume': { title: 'Surface et volume', description: 'Mesurez rapidement pour chiffrer les matériaux avec précision.' },
    argamassa: { title: 'Mortier', description: 'Calculez la consommation selon la surface et l’épaisseur.' },
    'calculo-contrapeso': { title: 'Calcul du contrepoids', description: 'Définissez le contrepoids selon la cabine et la capacité.' },
    'capacidade-carga': { title: 'Capacité de charge', description: 'Calculez la charge maximale selon la surface et la norme.' },
    'velocidade-pavimentos': { title: 'Vitesse × Étages', description: 'Reliez vitesse et nombre d’étages au temps de trajet.' },
    'checklist-elevador': { title: 'Checklist d’inspection', description: 'Routine guidée d’inspection et de maintenance préventive.' },
    'diluicao-limpeza': { title: 'Dilution du produit', description: 'Calculez produit et eau selon la proportion et le volume final.' },
    'rendimento-area': { title: 'Rendement par surface', description: 'Estimez la consommation selon la surface à nettoyer.' },
    'dimensionar-equipe': { title: 'Dimensionnement de l’équipe', description: 'Calculez la taille de l’équipe selon surface et durée.' },
    'material-limpeza': { title: 'Matériel', description: 'Listez le matériel et les quantités selon le type et la fréquence.' },
    'dosagem-area': { title: 'Dosage par surface', description: 'Calculez la dose selon la surface et le nuisible ciblé.' },
    'diluicao-dedetizacao': { title: 'Dilution', description: 'Définissez le mélange selon la concentration et le volume.' },
    'area-cobertura': { title: 'Surface couverte', description: 'Calculez la couverture par litre selon le débit et la bouillie.' },
    reaplicacao: { title: 'Réapplication', description: 'Planifiez l’intervalle selon le nuisible et le produit.' },
  },
};

export function localizeNicheTools(
  tools: NicheTool[],
  locale: LocaleCode,
  registry: Record<string, { label: string; description: string }>,
): NicheTool[] {
  return tools.map((tool) => {
    const registered = registry[tool.id];
    const translated = NICHE_TOOL_TRANSLATIONS[locale]?.[tool.id];
    return {
      ...tool,
      title: registered?.label ?? translated?.title ?? tool.title,
      description: registered?.description ?? translated?.description ?? tool.description,
    };
  });
}
