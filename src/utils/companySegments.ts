import {
  Snowflake, Zap, Sun, Radio, Camera, HardHat, Cog, ArrowUpDown,
  Bot, Sparkles, Bug, Wrench, SprayCan, MoreHorizontal, type LucideIcon,
} from 'lucide-react';

/**
 * FONTE ÚNICA de segmentos de empresa do Dominex.
 *
 * Tudo que escolhe ou resolve um segmento (cadastro, admin, Área do Técnico,
 * badges, landings do site) deriva DESTE arquivo. Não duplique o catálogo.
 *
 * Camadas de uso (controladas pelos flags abaixo):
 *  - `site: true`  → os 9 nichos que têm landing pública no site. São os
 *    únicos OFERECIDOS na Área do Técnico (switcher de nicho) e a base da
 *    lista selecionável no cadastro/admin. Use `getSiteSegments()`.
 *  - `selectableInSignup: true` (apenas "outro") → coringa do onboarding;
 *    aparece na lista de ESCOLHA do cadastro/admin junto dos 9, mas não é
 *    um nicho do site nem tem ferramentas. Use `getSelectableSegments()`.
 *  - sem flag (engenharia, automacao, manutencao, estetica_automotiva) →
 *    LEGADO. Saíram das listas de escolha, MAS continuam existindo no
 *    catálogo pra `getSegment(value)` resolver cor/ícone/label de empresas
 *    já cadastradas nesses valores. NUNCA remover do array.
 *
 * Regra-lei: `getSegment()` resolve QUALQUER um dos 14 (inclusive legado).
 * Só as listas de ESCOLHA (helpers de seleção) são filtradas. Telas que
 * EXIBEM/FILTRAM dados já gravados iteram o catálogo completo ou usam
 * `getSegment`, pra não esconder o segmento de uma empresa legada.
 */

export interface CompanySegment {
  value: string;
  label: string;
  color: string; // hex
  icon: LucideIcon;
  /** Descrição curta exibida nos cards de seleção (ex.: etapa de Segmento do cadastro). Opcional/aditivo. */
  description?: string;
  /** true = nicho com landing no site e ferramentas na Área do Técnico (os 9 canônicos). */
  site?: boolean;
  /** true = aparece na lista de ESCOLHA do cadastro/admin mesmo não sendo `site` (caso "outro"). */
  selectableInSignup?: boolean;
}

export const COMPANY_SEGMENTS: CompanySegment[] = [
  { value: 'refrigeracao',     label: 'Refrigeração e Climatização', color: '#06b6d4', icon: Snowflake,       description: 'Ar condicionado, refrigeração comercial e industrial', site: true },
  { value: 'eletrica',         label: 'Instalações Elétricas',       color: '#f59e0b', icon: Zap,             description: 'Instalação e manutenção elétrica, quadros e projetos', site: true },
  { value: 'solar',            label: 'Energia Solar',               color: '#eab308', icon: Sun,             description: 'Instalação e manutenção de sistemas fotovoltaicos', site: true },
  { value: 'telecom',          label: 'Telecomunicações / Provedores', color: '#3b82f6', icon: Radio,         description: 'Provedores de internet, redes e infraestrutura', site: true },
  { value: 'cftv',             label: 'CFTV e Segurança Eletrônica', color: '#6366f1', icon: Camera,          description: 'Câmeras, alarmes, controle de acesso e monitoramento', site: true },
  { value: 'construcao',       label: 'Construção Civil',            color: '#a16207', icon: HardHat,         description: 'Obras, reformas e serviços de construção', site: true },
  { value: 'elevadores',       label: 'Elevadores',                  color: '#ef4444', icon: ArrowUpDown,     description: 'Instalação e manutenção de elevadores e escadas', site: true },
  { value: 'limpeza',          label: 'Limpeza e Conservação',       color: '#10b981', icon: Sparkles,        description: 'Limpeza predial, conservação e zeladoria', site: true },
  { value: 'dedetizacao',      label: 'Dedetização',                 color: '#65a30d', icon: Bug,             description: 'Controle de pragas e sanitização', site: true },
  // Coringa do onboarding — selecionável no cadastro/admin, mas não é nicho do site nem tem ferramentas.
  { value: 'outro',            label: 'Outro',                       color: '#6b7280', icon: MoreHorizontal,  description: 'Personalizar pro seu tipo de negócio', selectableInSignup: true },
  // LEGADO (não-selecionável) — mantidos só para `getSegment` resolver empresas já cadastradas. NÃO remover.
  { value: 'engenharia',       label: 'Engenharia',                  color: '#0ea5e9', icon: Cog,             description: 'Projetos, consultoria e laudos técnicos' },
  { value: 'automacao',        label: 'Automação Industrial',        color: '#8b5cf6', icon: Bot,             description: 'Painéis, CLPs e automação de processos' },
  { value: 'manutencao',       label: 'Manutenção Predial',          color: '#ec4899', icon: Wrench,          description: 'Manutenção geral, hidráulica e reparos prediais' },
  { value: 'estetica_automotiva', label: 'Estética Automotiva',      color: '#14b8a6', icon: SprayCan,        description: 'Lavagem, polimento, vitrificação e detailing' },
];

/**
 * Resolve QUALQUER segmento do catálogo (os 9 do site + "outro" + os 4 legados).
 * INALTERADO de propósito: badges/selos de empresas legadas dependem disso.
 */
export function getSegment(value: string | null | undefined): CompanySegment | null {
  if (!value) return null;
  return COMPANY_SEGMENTS.find(s => s.value === value) || null;
}

/**
 * Os 9 nichos do site, na ordem do catálogo. Usado na Área do Técnico
 * (switcher de nicho) — só esses têm landing e ferramentas.
 */
export function getSiteSegments(): CompanySegment[] {
  return COMPANY_SEGMENTS.filter(s => s.site);
}

/**
 * Lista de ESCOLHA do cadastro e do admin: os 9 do site + "Outro" (coringa).
 * NÃO inclui os 4 legados. Telas de exibição/filtro de dado existente NÃO
 * devem usar este helper — elas iteram o catálogo completo ou usam `getSegment`.
 */
export function getSelectableSegments(): CompanySegment[] {
  return COMPANY_SEGMENTS.filter(s => s.site || s.selectableInSignup);
}
