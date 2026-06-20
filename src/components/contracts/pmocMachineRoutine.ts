// Fonte ÚNICA da rotina PMOC POR MÁQUINA (Fase 3/5). Tudo que transforma escopo
// + fase + listagem própria de cada equipamento em (a) itens com pmoc_scope/
// pmoc_start_visit e (b) plano de atividades por máquina (com equipment_ref) +
// atividades de LOCAL vive aqui. Reusado pelo formulário de contrato
// (ContractFormDialog) E pela aba Ambientes (ContractEnvironmentsTab) pra NÃO
// divergir de lógica: os dois montam o payload com as MESMAS funções e salvam
// pelo MESMO caminho (updateContract / createContract no useContracts).
import type { PlanActivityInput, FreqCode } from '@/hooks/useContracts';
import type { PmocCatalogActivity } from '@/hooks/usePmocActivityCatalog';
import { PMOC_DEFAULT_SECTION } from '@/hooks/usePmocActivityCatalog';

// Escopo da norma POR MÁQUINA. 'ac' = só condicionadores e medições/testes do
// aparelho; 'full' = toda a norma aplicável ao equipamento (grande porte:
// VRF/Chiller/Torre…). As seções de LOCAL (casa de máquinas, dutos, torres,
// bombas…) NÃO entram por máquina — vão pro "bucket local" do contrato, gerado
// uma vez quando há ≥1 máquina 'full'.
export type PmocMachineScope = 'ac' | 'full';

// Seções da norma cujas atividades são de LOCAL (não se repetem por aparelho):
// casa de máquinas, dutos, torres, bombas, etc. Tudo fora desse conjunto
// (condicionadores, medições, testes…) é por equipamento por default.
export const LOCAL_SCOPE_SECTIONS = new Set<string>([
  'casa_maquinas',
  'dutos',
  'tomada_ar_exterior',
  'torres_resfriamento',
  'bombas_agua',
  'caixa_expansao',
  'tratamento_quimico',
  'quadros_eletricos',
  'qualidade_ar',
]);

// Seções por-equipamento do escopo 'ac' (condicionador + medições/testes do
// próprio aparelho).
export const AC_EQUIPMENT_SECTIONS = new Set<string>(['condicionadores', 'medicoes', 'testes']);

export function isLocalSection(section: string | null | undefined): boolean {
  return !!section && LOCAL_SCOPE_SECTIONS.has(section);
}

// Escopo default de uma atividade do catálogo a partir da seção. Atividade sem
// seção (manual livre) é por equipamento por default.
export function defaultScopeForSection(section: string | null | undefined): boolean {
  if (section && LOCAL_SCOPE_SECTIONS.has(section)) return false; // local
  return true; // por equipamento
}

// As atividades do catálogo que se aplicam a UMA máquina, dado o escopo. Sempre
// exclui seções de local (essas viram o bucket local do contrato).
export function machineCatalogActivities(
  all: PmocCatalogActivity[],
  scope: PmocMachineScope,
): PmocCatalogActivity[] {
  return all.filter(a => {
    if (isLocalSection(a.section)) return false;
    if (scope === 'ac') return AC_EQUIPMENT_SECTIONS.has(a.section);
    return true; // full = toda a norma do aparelho
  });
}

// Atividades de LOCAL do catálogo (casa de máquinas, dutos, torres, bombas…).
// Entram uma única vez no contrato quando há ao menos uma máquina 'full'.
export function localCatalogActivities(all: PmocCatalogActivity[]): PmocCatalogActivity[] {
  return all.filter(a => isLocalSection(a.section));
}

// Opções de "começa na visita" (ciclo de 12). Acumulativo: a posição N define
// quais níveis a 1ª visita já traz (M sempre; T se N%3==0; S se N%6==0; A se N==12).
export const START_VISIT_OPTIONS: { value: number; label: string; hint: string }[] = [
  { value: 1, label: 'Visita 1 (Mensal)', hint: 'A 1ª visita faz só o mensal; trimestral/semestral/anual entram quando o ciclo chegar lá.' },
  { value: 3, label: 'Visita 3 (Mensal + Trimestral)', hint: 'A 1ª visita já faz mensal + trimestral.' },
  { value: 6, label: 'Visita 6 (+ Semestral)', hint: 'A 1ª visita faz mensal + trimestral + semestral.' },
  { value: 12, label: 'Visita 12 (Anual — revisão completa)', hint: 'A 1ª visita é a revisão anual completa (mensal + trimestral + semestral + anual). Recomendado para começar com tudo em dia.' },
];

export function startVisitLabel(v: number): string {
  return START_VISIT_OPTIONS.find(o => o.value === v)?.label ?? `Visita ${v}`;
}

// O que a 1ª visita inclui, em texto curto, para o preview por máquina.
export function firstVisitContents(startVisit: number): string {
  const levels: string[] = ['mensal'];
  if (startVisit % 3 === 0) levels.push('trimestral');
  if (startVisit % 6 === 0) levels.push('semestral');
  if (startVisit === 12) levels.push('anual');
  return levels.join(' + ');
}

// Linha do editor de plano (estado de UI). Vira PlanActivityInput no submit.
// Carrega os metadados do catálogo PMOC (section/component/medição) quando a
// linha vem do picker; linhas manuais livres só têm description + freq_code.
export interface PlanActivityRow {
  description: string;
  guidance?: string | null;
  freq_code: FreqCode;
  section?: string | null;
  component?: string | null;
  is_measurement?: boolean;
  unit?: string | null;
  expected_min?: number | null;
  expected_max?: number | null;
  catalog_activity_id?: string | null;
  // Escopo (Fase 3): true = por equipamento (default), false = geral/local.
  applies_per_equipment?: boolean;
  // Plano POR MÁQUINA (Fase 3): equipment_id dono da atividade. O hook resolve
  // o contract_item_id a partir disso (no create os ids só nascem no insert).
  // null/undefined = atividade de local ou legado (sem máquina).
  equipment_ref?: string | null;
  // contract_item_id já resolvido (edição de contrato já persistido).
  contract_item_id?: string | null;
}

// Configuração de rotina de UMA máquina (estado de UI). `activities` é a
// listagem própria da máquina (norma do escopo por default, ou subset escolhido
// no picker). `customized` marca que o gestor mexeu na listagem (não segue 100%).
export interface MachineConfig {
  scope: PmocMachineScope;
  startVisit: number;
  activities: PlanActivityRow[];
  customized: boolean;
}

// Item/equipamento do contrato no formato mínimo usado pelos builders.
export interface MachineItemRef {
  equipment_id: string;
  item_name: string;
  item_description?: string | null;
}

// Linha do editor → PlanActivityInput (preserva os metadados do catálogo).
export function planRowToInput(a: PlanActivityRow): PlanActivityInput {
  return {
    description: a.description,
    guidance: a.guidance ?? null,
    freq_code: a.freq_code,
    section: a.section ?? null,
    component: a.component ?? null,
    is_measurement: a.is_measurement ?? false,
    unit: a.unit ?? null,
    expected_min: a.expected_min ?? null,
    expected_max: a.expected_max ?? null,
    catalog_activity_id: a.catalog_activity_id ?? null,
    applies_per_equipment: a.applies_per_equipment ?? true,
    equipment_ref: a.equipment_ref ?? null,
    contract_item_id: a.contract_item_id ?? null,
  };
}

// Normaliza o default_freq_code do catálogo (string) pro FreqCode do editor.
export function catalogFreqCode(code: string | null | undefined): FreqCode {
  if (code && ['M', 'T', 'S', 'A', 'E'].includes(code)) return code as FreqCode;
  return 'M';
}

// Atividade do catálogo PMOC → linha editável do plano (ponto de partida).
export function catalogToPlanRow(a: PmocCatalogActivity): PlanActivityRow {
  return {
    description: a.description,
    guidance: a.guidance ?? null,
    freq_code: catalogFreqCode(a.default_freq_code),
    section: a.section,
    component: a.component,
    is_measurement: a.is_measurement,
    unit: a.unit,
    expected_min: a.expected_min,
    expected_max: a.expected_max,
    catalog_activity_id: a.id,
    // Escopo default vem da seção da norma (aparelho vs. local).
    applies_per_equipment: defaultScopeForSection(a.section),
  };
}

// Mapeia uma linha persistida (freq_code OU freq_months) pro código que o editor
// suporta (M/T/S/A/E). freq_code ganha; senão deriva de freq_months; default M.
export function planRowToFreqCode(row: { freq_code: string | null; freq_months: number | null }): FreqCode {
  if (row.freq_code && ['M', 'T', 'S', 'A', 'E'].includes(row.freq_code)) return row.freq_code as FreqCode;
  switch (row.freq_months) {
    case 1: return 'M';
    case 3: return 'T';
    case 6: return 'S';
    case 12: return 'A';
    default: return 'M';
  }
}

// Config default de uma máquina: escopo dado (default 'ac'), começa na 12
// (anual = revisão completa) e listagem = toda a norma do escopo (não
// personalizado). `equipment_ref` amarra cada atividade ao seu equipamento.
export function buildDefaultMachineConfig(
  catalogActivities: PmocCatalogActivity[],
  eqId: string,
  scope: PmocMachineScope,
): MachineConfig {
  const acts = machineCatalogActivities(catalogActivities, scope).map(a => ({
    ...catalogToPlanRow(a),
    applies_per_equipment: true,
    equipment_ref: eqId,
  }));
  return { scope, startVisit: 12, activities: acts, customized: false };
}

// Reconstrói as configs POR MÁQUINA a partir do que está PERSISTIDO (edição):
//  - escopo/fase de cada máquina vêm de contract_items (pmoc_scope/pmoc_start_visit);
//  - a listagem própria vem das contract_plan_activities agrupadas por
//    contract_item_id (→ equipment_id);
//  - LEGADO (plano sem contract_item_id): cada máquina recebe a config default
//    da norma (escopo inferido pelas seções; start 12 = tudo na 1ª visita) →
//    ao salvar migra pro formato por máquina SEM regredir as visitas.
// Fonte única usada pelo form (em edição) e pela aba.
export interface PersistedContractItem {
  id: string;
  equipment_id: string | null;
  pmoc_scope?: string | null;
  pmoc_start_visit?: number | null;
}
export interface PersistedPlanRow {
  description: string;
  guidance?: string | null;
  freq_code: string | null;
  freq_months: number | null;
  section?: string | null;
  component?: string | null;
  is_measurement?: boolean;
  unit?: string | null;
  expected_min?: number | null;
  expected_max?: number | null;
  catalog_activity_id?: string | null;
  contract_item_id?: string | null;
}

export function reconstructMachineConfigs(args: {
  items: PersistedContractItem[];
  plan: PersistedPlanRow[];
  catalogActivities: PmocCatalogActivity[];
}): Record<string, MachineConfig> {
  const { items, plan, catalogActivities } = args;
  const itemIdToEquip: Record<string, string> = {};
  const itemMeta: Record<string, { scope: PmocMachineScope; startVisit: number }> = {};
  for (const it of items) {
    if (it.equipment_id) {
      itemIdToEquip[it.id] = it.equipment_id;
      itemMeta[it.equipment_id] = {
        scope: (it.pmoc_scope === 'full' ? 'full' : 'ac') as PmocMachineScope,
        startVisit: typeof it.pmoc_start_visit === 'number' && it.pmoc_start_visit >= 1 ? it.pmoc_start_visit : 12,
      };
    }
  }

  const hasPerMachine = plan.some(r => !!r.contract_item_id);
  const configs: Record<string, MachineConfig> = {};

  if (hasPerMachine) {
    // Formato novo: agrupa as atividades por máquina via contract_item_id.
    const byEquip: Record<string, PlanActivityRow[]> = {};
    for (const r of plan) {
      const eqId = r.contract_item_id ? itemIdToEquip[r.contract_item_id] : null;
      if (!eqId) continue; // locais/legado tratados pelo bucket derivado
      const row: PlanActivityRow = {
        description: r.description,
        guidance: r.guidance ?? null,
        freq_code: planRowToFreqCode(r),
        section: r.section,
        component: r.component,
        is_measurement: r.is_measurement,
        unit: r.unit,
        expected_min: r.expected_min,
        expected_max: r.expected_max,
        catalog_activity_id: r.catalog_activity_id,
        applies_per_equipment: true,
        equipment_ref: eqId,
      };
      (byEquip[eqId] ??= []).push(row);
    }
    for (const it of items) {
      if (!it.equipment_id) continue;
      const meta = itemMeta[it.equipment_id] ?? { scope: 'ac' as PmocMachineScope, startVisit: 12 };
      const acts = byEquip[it.equipment_id] ?? [];
      // Personalizado = listagem difere da norma do escopo (algum item removido/adicionado).
      const normaCount = machineCatalogActivities(catalogActivities, meta.scope).length;
      configs[it.equipment_id] = {
        scope: meta.scope,
        startVisit: meta.startVisit,
        activities: acts.length > 0
          ? acts
          : machineCatalogActivities(catalogActivities, meta.scope).map(a => ({ ...catalogToPlanRow(a), applies_per_equipment: true, equipment_ref: it.equipment_id! })),
        customized: acts.length !== normaCount,
      };
    }
  } else {
    // Legado: nenhuma máquina tem contract_item_id. Infere escopo pelas seções
    // do plano (alguma fora de condicionadores → 'full') e dá start 12 (tudo na
    // 1ª visita). Cada máquina recebe a norma do escopo inferido.
    const hasNonAc = plan.some(r => r.section && !AC_EQUIPMENT_SECTIONS.has(r.section) && !LOCAL_SCOPE_SECTIONS.has(r.section));
    const scope: PmocMachineScope = hasNonAc ? 'full' : 'ac';
    for (const it of items) {
      if (!it.equipment_id) continue;
      const meta = itemMeta[it.equipment_id];
      const useScope = meta?.scope ?? scope;
      configs[it.equipment_id] = {
        scope: useScope,
        startVisit: meta?.startVisit ?? 12,
        activities: machineCatalogActivities(catalogActivities, useScope).map(a => ({ ...catalogToPlanRow(a), applies_per_equipment: true, equipment_ref: it.equipment_id! })),
        customized: false,
      };
    }
  }

  return configs;
}

// Há ao menos uma máquina de grande porte ('full')? Gate do bucket local.
export function hasFullMachine(machineConfigs: Record<string, MachineConfig>): boolean {
  return Object.values(machineConfigs).some(c => c.scope === 'full');
}

// Atividades de LOCAL do contrato (torres/bombas/casa de máquinas…). Entram uma
// única vez quando há ≥1 máquina 'full'. contract_item_id null + per_equip false.
export function buildLocalActivityRows(
  catalogActivities: PmocCatalogActivity[],
  machineConfigs: Record<string, MachineConfig>,
): PlanActivityRow[] {
  if (!hasFullMachine(machineConfigs)) return [];
  return localCatalogActivities(catalogActivities).map(a => ({
    ...catalogToPlanRow(a),
    applies_per_equipment: false,
    equipment_ref: null,
  }));
}

// Plano completo (por máquina + local) que vai pro hook em PMOC. Cada atividade
// de máquina carrega `equipment_ref` (o hook resolve contract_item_id) e
// applies_per_equipment=true; as locais ficam sem máquina + per_equip=false.
export function buildPmocPlanFromMachines(args: {
  items: MachineItemRef[];
  machineConfigs: Record<string, MachineConfig>;
  catalogActivities: PmocCatalogActivity[];
}): PlanActivityRow[] {
  const { items, machineConfigs, catalogActivities } = args;
  const rows: PlanActivityRow[] = [];
  for (const item of items) {
    const cfg = machineConfigs[item.equipment_id];
    if (!cfg) continue;
    for (const a of cfg.activities) {
      rows.push({ ...a, applies_per_equipment: true, equipment_ref: item.equipment_id });
    }
  }
  rows.push(...buildLocalActivityRows(catalogActivities, machineConfigs));
  return rows;
}

// Itens com escopo/fase por máquina (Fase 3) → payload `items` do hook
// (createContract/updateContract). Cada item anexa pmoc_scope + pmoc_start_visit.
export interface PmocItemWithScope {
  equipment_id: string | null;
  item_name: string;
  item_description: string | null;
  form_template_id: string | null;
  pmoc_scope: PmocMachineScope;
  pmoc_start_visit: number;
}
export function buildPmocItemsWithScope(args: {
  items: MachineItemRef[];
  machineConfigs: Record<string, MachineConfig>;
}): PmocItemWithScope[] {
  const { items, machineConfigs } = args;
  return items.map((i) => {
    const cfg = machineConfigs[i.equipment_id];
    return {
      equipment_id: i.equipment_id || null,
      item_name: i.item_name,
      item_description: i.item_description || null,
      form_template_id: null,
      pmoc_scope: (cfg?.scope ?? 'ac') as PmocMachineScope,
      pmoc_start_visit: cfg?.startVisit ?? 12,
    };
  });
}
