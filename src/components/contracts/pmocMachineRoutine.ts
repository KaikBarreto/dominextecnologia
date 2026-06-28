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

// Seção sintética das atividades de checklist PERSONALIZADO (form_templates da
// empresa). Não vem do catálogo PMOC nem do banco — é uma marca de plano pra o
// motor não filtrar por escopo (custom vale pra qualquer máquina) e pra a
// Planilha/checklist saberem agrupar como "personalizados".
export const PMOC_CUSTOM_SECTION = 'personalizados';

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

// Ordena/particiona os grupos de seção do catálogo para o picker POR ESCOPO:
//  - scope 'ac'   → só as seções de ar-condicionado (condicionadores/medições/
//    testes), com Condicionadores (Split/ACJ) sempre PRIMEIRO.
//  - scope 'full' → TODAS as seções: primeiro o bloco de ar-condicionado, depois
//    as demais (grande porte: torres, bombas, casa de máquinas, dutos…).
// Retorna a lista de seções (chave técnica) já na ordem desejada. Usado pra
// montar o accordion seccionado do picker e pra saber o que vem pré-marcado.
export const AC_PICKER_SECTION_ORDER = ['condicionadores', 'medicoes', 'testes'];

export function isAcSection(section: string | null | undefined): boolean {
  return !!section && AC_EQUIPMENT_SECTIONS.has(section);
}

// Dada a lista de seções existentes no catálogo, devolve {acSections, otherSections}
// já ordenadas (condicionadores primeiro nas AC; as demais na ordem de entrada).
export function partitionPickerSections(allSections: string[]): {
  acSections: string[];
  otherSections: string[];
} {
  const present = new Set(allSections);
  const acSections = AC_PICKER_SECTION_ORDER.filter((s) => present.has(s));
  // Qualquer AC presente que não esteja na ordem canônica entra no fim do bloco AC.
  for (const s of allSections) {
    if (isAcSection(s) && !acSections.includes(s)) acSections.push(s);
  }
  const otherSections = allSections.filter((s) => !isAcSection(s));
  return { acSections, otherSections };
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
  // Checklist personalizado (Fase 2): id de um form_templates da empresa. Linha
  // custom = catalog_activity_id null + form_template_id setado + section
  // 'personalizados'. Aditiva: feita ALÉM das atividades da norma, em toda visita.
  form_template_id?: string | null;
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
  // Checklists personalizados (form_templates) escolhidos pra esta máquina. São
  // feitos em TODA visita, ALÉM das atividades da norma. Independem do escopo
  // ('ac'/'full'). Default [].
  customTemplateIds: string[];
  // Ids de perguntas (form_questions) dos checklists PERSONALIZADOS desta máquina
  // que NÃO entram na 1ª OS dela (a âncora por equipamento que o render respeita,
  // espelha `contract_items.first_os_excluded_questions`). Perguntas "toda visita"
  // NUNCA entram aqui (sempre na 1ª OS). Default []. Só vale pros personalizados —
  // o catálogo da norma tem fase própria (pmoc_start_visit).
  firstOsExcludedQuestions: string[];
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
    form_template_id: a.form_template_id ?? null,
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
  return { scope, startVisit: 12, activities: acts, customized: false, customTemplateIds: [], firstOsExcludedQuestions: [] };
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
  // Âncora por equipamento dos personalizados (jsonb array de ids). Carregada na
  // reconstrução pra a config saber quais perguntas o gestor tirou da 1ª OS.
  first_os_excluded_questions?: unknown;
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
  form_template_id?: string | null;
  contract_item_id?: string | null;
}

export function reconstructMachineConfigs(args: {
  items: PersistedContractItem[];
  plan: PersistedPlanRow[];
  catalogActivities: PmocCatalogActivity[];
}): Record<string, MachineConfig> {
  const { items, plan, catalogActivities } = args;
  const itemIdToEquip: Record<string, string> = {};
  const itemMeta: Record<string, { scope: PmocMachineScope; startVisit: number; firstOsExcludedQuestions: string[] }> = {};
  for (const it of items) {
    if (it.equipment_id) {
      itemIdToEquip[it.id] = it.equipment_id;
      itemMeta[it.equipment_id] = {
        scope: (it.pmoc_scope === 'full' ? 'full' : 'ac') as PmocMachineScope,
        startVisit: typeof it.pmoc_start_visit === 'number' && it.pmoc_start_visit >= 1 ? it.pmoc_start_visit : 12,
        firstOsExcludedQuestions: Array.isArray(it.first_os_excluded_questions)
          ? (it.first_os_excluded_questions as unknown[]).filter((x): x is string => typeof x === 'string')
          : [],
      };
    }
  }

  const hasPerMachine = plan.some(r => !!r.contract_item_id);
  const configs: Record<string, MachineConfig> = {};

  if (hasPerMachine) {
    // Formato novo: agrupa as atividades por máquina via contract_item_id.
    const byEquip: Record<string, PlanActivityRow[]> = {};
    // Checklists personalizados por máquina (linhas com form_template_id) — não
    // entram na listagem do catálogo; carregam o customTemplateIds da config.
    const customByEquip: Record<string, string[]> = {};
    for (const r of plan) {
      const eqId = r.contract_item_id ? itemIdToEquip[r.contract_item_id] : null;
      if (!eqId) continue; // locais/legado tratados pelo bucket derivado
      if (r.form_template_id) {
        const arr = (customByEquip[eqId] ??= []);
        if (!arr.includes(r.form_template_id)) arr.push(r.form_template_id);
        continue; // linha custom não é atividade do catálogo
      }
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
      const meta = itemMeta[it.equipment_id] ?? { scope: 'ac' as PmocMachineScope, startVisit: 12, firstOsExcludedQuestions: [] };
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
        customTemplateIds: customByEquip[it.equipment_id] ?? [],
        firstOsExcludedQuestions: meta.firstOsExcludedQuestions,
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
        customTemplateIds: [],
        firstOsExcludedQuestions: meta?.firstOsExcludedQuestions ?? [],
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
  // Nome de cada form_template (id → nome), pra rotular a linha de plano custom.
  // Template sem nome no mapa cai num rótulo genérico (não bloqueia o save).
  templateNameById?: Record<string, string>;
}): PlanActivityRow[] {
  const { items, machineConfigs, catalogActivities, templateNameById = {} } = args;
  const rows: PlanActivityRow[] = [];
  for (const item of items) {
    const cfg = machineConfigs[item.equipment_id];
    if (!cfg) continue;
    for (const a of cfg.activities) {
      rows.push({ ...a, applies_per_equipment: true, equipment_ref: item.equipment_id });
    }
    // Uma linha de plano por checklist personalizado da máquina. Feita em TODA
    // visita (freq Mensal) e ALÉM das atividades da norma. catalog_activity_id
    // null + form_template_id setado + section 'personalizados'.
    for (const templateId of cfg.customTemplateIds ?? []) {
      rows.push({
        description: templateNameById[templateId] ?? 'Checklist personalizado',
        guidance: null,
        freq_code: 'M',
        section: PMOC_CUSTOM_SECTION,
        component: null,
        is_measurement: false,
        unit: null,
        expected_min: null,
        expected_max: null,
        catalog_activity_id: null,
        form_template_id: templateId,
        applies_per_equipment: true,
        equipment_ref: item.equipment_id,
      });
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
  // Âncora por equipamento dos personalizados (1ª-OS por pergunta). Sanitizada:
  // só ids de perguntas que pertencem aos templates personalizados selecionados
  // da máquina; "toda visita" nunca entra.
  // `undefined` = templates ainda carregando e a máquina tem personalizados não
  // resolvidos → não dá pra sanitizar com segurança; o hook preserva o valor do
  // banco em vez de zerar (mesma guarda do checklist comum, evita perda de dado).
  first_os_excluded_questions: string[] | undefined;
}

// Forma mínima de uma pergunta de checklist personalizado pra sanitizar a âncora
// da 1ª OS sem arrastar React/Radix: id + se é "toda visita" (obrigatória).
export interface TemplateQuestionRef {
  id: string;
  everyVisit: boolean;
}

export function buildPmocItemsWithScope(args: {
  items: MachineItemRef[];
  machineConfigs: Record<string, MachineConfig>;
  // Perguntas (id + everyVisit) de cada form_template, por id de template. Usado
  // pra sanitizar a âncora da 1ª OS: só ids que pertencem aos templates
  // SELECIONADOS da máquina e que NÃO são "toda visita". Vazio/ausente = nada
  // sanitiza (preserva [] — sem âncora), em vez de gravar lixo.
  templateQuestions?: Record<string, TemplateQuestionRef[]>;
  // Quando os form_templates ainda estão carregando (`useFormTemplates`), uma
  // máquina com personalizados selecionados cujas perguntas ainda NÃO estão em
  // `templateQuestions` não pode ser sanitizada — sanitizar agora filtraria toda
  // exclusão persistida pra [], apagando a âncora da 1ª OS no save. Nesse caso o
  // item sai com `first_os_excluded_questions: undefined` pra o hook PRESERVAR o
  // valor do banco (mesma guarda do `commonChecklistPayload` do checklist comum).
  templatesLoading?: boolean;
}): PmocItemWithScope[] {
  const { items, machineConfigs, templateQuestions = {}, templatesLoading = false } = args;
  return items.map((i) => {
    const cfg = machineConfigs[i.equipment_id];
    const customTemplateIds = cfg?.customTemplateIds ?? [];
    // Guarda anti-perda-de-dado: templates carregando E há personalizado cujas
    // perguntas ainda não resolveram → devolve undefined (hook preserva o banco).
    if (
      templatesLoading &&
      customTemplateIds.some((tplId) => templateQuestions[tplId] === undefined)
    ) {
      return {
        equipment_id: i.equipment_id || null,
        item_name: i.item_name,
        item_description: i.item_description || null,
        form_template_id: null,
        pmoc_scope: (cfg?.scope ?? 'ac') as PmocMachineScope,
        pmoc_start_visit: cfg?.startVisit ?? 12,
        first_os_excluded_questions: undefined,
      };
    }
    // Ids válidos pra exclusão: perguntas não-toda-visita dos templates escolhidos.
    const validExcludable = new Set<string>();
    for (const tplId of customTemplateIds) {
      for (const q of templateQuestions[tplId] ?? []) {
        if (!q.everyVisit) validExcludable.add(q.id);
      }
    }
    const excluded = (cfg?.firstOsExcludedQuestions ?? []).filter((id) => validExcludable.has(id));
    return {
      equipment_id: i.equipment_id || null,
      item_name: i.item_name,
      item_description: i.item_description || null,
      form_template_id: null,
      pmoc_scope: (cfg?.scope ?? 'ac') as PmocMachineScope,
      pmoc_start_visit: cfg?.startVisit ?? 12,
      first_os_excluded_questions: excluded,
    };
  });
}
