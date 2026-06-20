import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { useAuth } from '@/contexts/AuthContext';
import { addDays, addMonths } from 'date-fns';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';

export interface Contract {
  id: string;
  company_id: string;
  name: string;
  customer_id: string;
  technician_id: string | null;
  service_type_id: string | null;
  form_template_id: string | null;
  status: string;
  notes: string | null;
  frequency_type: string;
  frequency_value: number;
  start_date: string;
  horizon_months: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // PMOC (Onda A — Lei Federal 13.589/2018). Quando `is_pmoc=true`, RT é obrigatório
  // e cada OS gerada herda o selo de conformidade.
  is_pmoc: boolean;
  responsible_technician_id: string | null;
  pmoc_legal_compliance_text: string | null;
  next_pmoc_generation_date: string | null;
  // Gate dos documentos no portal público (2026-06). Quando false, o portal do
  // cliente final NÃO exibe os documentos PMOC (Dossiê, TRT, Certificado,
  // Cronograma). O gestor libera/oculta na aba Documentos do contrato.
  portal_documents_released: boolean;
  customers?: { id: string; name: string; document?: string | null; address?: string | null; city?: string | null; state?: string | null } | null;
  // Alias singular do MESMO cliente do contrato (FK customer_id). Existe porque
  // alguns consumidores (ex.: select "Contrato vinculado" no financeiro) leem
  // `contract.customer?.name`. Sem este alias o label caía em "Sem cliente".
  customer?: { id: string; name: string } | null;
  responsible_technicians?: { id: string; full_name: string; cft_crea: string | null; modality: string | null } | null;
  contract_items?: ContractItem[];
  // Ambientes climatizados do contrato (multi-ambiente PMOC). Cada contrato PMOC
  // gerencia N ambientes; cada ambiente agrupa seus próprios equipamentos via
  // contract_items.environment_id. Contrato comum não usa ambientes (lista flat).
  contract_environments?: ContractEnvironment[];
  // OSs do contrato — fonte única das "visitas". Embute via FK
  // service_orders.contract_id. A tabela-sombra de ocorrências foi aposentada:
  // cada OS recorrente JÁ é a visita (geração eager desde a v1.9.12).
  service_orders?: ContractServiceOrder[];
}

/**
 * OS de um contrato, na forma mínima usada pela listagem e pelas stats.
 * "Visita #N" é DERIVADA: ordenar por scheduled_date asc e usar index + 1
 * (não existe occurrence_number em service_orders).
 */
export interface ContractServiceOrder {
  id: string;
  order_number: number;
  status: string;
  scheduled_date: string | null;
}

export interface ContractItem {
  id: string;
  contract_id: string;
  equipment_id: string | null;
  // Ambiente climatizado ao qual o equipamento pertence (multi-ambiente PMOC).
  // null = sem ambiente (caso comum / item flat).
  environment_id: string | null;
  item_name: string;
  item_description: string | null;
  form_template_id: string | null;
  sort_order: number;
  equipment?: { id: string; name: string; brand: string | null; model: string | null } | null;
}

/**
 * Ambiente climatizado de um contrato PMOC (Seção 4 da Planilha PMOC, por
 * ambiente). 1 contrato → N ambientes; cada ambiente agrupa equipamentos via
 * contract_items.environment_id. Substitui os 6 campos pmoc_* únicos de
 * `contracts` (que ficaram legados/null).
 */
export interface ContractEnvironment {
  id: string;
  company_id: string;
  contract_id: string;
  identificacao: string | null;
  tipo_atividade: string | null;
  area_climatizada_m2: number | null;
  ocupantes_fixos: number | null;
  ocupantes_flutuantes: number | null;
  carga_termica_tr: number | null;
  sort_order: number;
}

/**
 * Ambiente na forma de ENTRADA (criação/edição). `equipment_ids` é o conjunto de
 * equipamentos do cliente que pertencem a este ambiente — vira
 * contract_items.environment_id. Um equipamento pertence a UM único ambiente.
 */
export interface ContractEnvironmentInput {
  // Presente em edição (ambiente já persistido); ausente em ambiente novo.
  id?: string;
  identificacao?: string | null;
  tipo_atividade?: string | null;
  area_climatizada_m2?: number | null;
  ocupantes_fixos?: number | null;
  ocupantes_flutuantes?: number | null;
  carga_termica_tr?: number | null;
  equipment_ids: string[];
}

// Status de OS que NÃO contam como "visita ativa". Tudo fora desse conjunto
// (agendada, pendente, a_caminho, em_andamento, pausada) é OS ativa/pendente.
const INACTIVE_OS_STATUSES = new Set(['concluida', 'cancelada']);

/** OS ativa = ainda vai/pode acontecer (não concluída nem cancelada). */
export function isActiveContractOS(os: { status?: string | null }): boolean {
  return !INACTIVE_OS_STATUSES.has(os.status ?? '');
}

/**
 * Próxima visita do contrato = OS ativa com menor scheduled_date.
 * Derivado 100% de service_orders (a OS recorrente É a visita).
 */
export function getNextContractOS<T extends { status?: string | null; scheduled_date?: string | null }>(
  oss: T[] | null | undefined,
): T | undefined {
  return (oss || [])
    .filter((os) => isActiveContractOS(os) && !!os.scheduled_date)
    .sort((a, b) => new Date(a.scheduled_date!).getTime() - new Date(b.scheduled_date!).getTime())[0];
}

export function generateOccurrences(
  startDate: Date,
  frequencyType: 'days' | 'months',
  frequencyValue: number,
  horizonMonths: number
): Date[] {
  const dates: Date[] = [];
  const endDate = addMonths(startDate, horizonMonths);
  let current = new Date(startDate);
  while (current <= endDate && dates.length < 120) {
    dates.push(new Date(current));
    if (frequencyType === 'months') {
      current = addMonths(current, frequencyValue);
    } else {
      current = addDays(current, frequencyValue);
    }
  }
  return dates;
}

/**
 * Frequência de uma atividade do plano do contrato.
 * `freq_code` (M/T/S/A/E) é a notação da norma PMOC; `freq_months` é o caso
 * genérico (não-PMOC) com intervalo livre em meses. Quando ambos vierem,
 * `freq_code` ganha. 'E' (eventual) nunca entra no cronograma automático.
 */
export type FreqCode = 'M' | 'T' | 'S' | 'A' | 'E';

export interface PlanActivityInput {
  description: string;
  guidance?: string | null;
  section?: string | null;
  component?: string | null;
  freq_code?: FreqCode | null;
  freq_months?: number | null;
  is_measurement?: boolean;
  unit?: string | null;
  expected_min?: number | null;
  expected_max?: number | null;
  contract_item_id?: string | null;
  catalog_activity_id?: string | null;
  // Escopo da atividade (Fase 3 — checklist por equipamento). `true` (default) =
  // a atividade se aplica a CADA equipamento do contrato (ex.: limpar filtro de
  // cada split). `false` = atividade de LOCAL (ex.: casa de máquinas, dutos) →
  // 1 linha sem equipamento. Atividade com `contract_item_id` específico
  // sempre resolve pro equipamento daquele item (ignora este flag).
  applies_per_equipment?: boolean;
}

/** Mapeia o código de frequência da norma para o período em meses. */
export function freqCodeToMonths(code: FreqCode): number {
  switch (code) {
    case 'M': return 1;
    case 'T': return 3;
    case 'S': return 6;
    case 'A': return 12;
    case 'E': return 0; // eventual — nunca devida no automático
    default: return 1;
  }
}

/**
 * Período em meses de uma atividade (freq_code ganha de freq_months).
 * Retorna 0 quando a atividade NÃO deve entrar no cronograma automático
 * (eventual ou sem frequência válida).
 */
export function activityPeriodMonths(a: Pick<PlanActivityInput, 'freq_code' | 'freq_months'>): number {
  if (a.freq_code) return freqCodeToMonths(a.freq_code);
  if (a.freq_months && a.freq_months > 0) return a.freq_months;
  return 0;
}

/** Uma atividade vence no mês de índice k (0-based) se o período divide k. */
export function isActivityDueAtMonth(
  a: Pick<PlanActivityInput, 'freq_code' | 'freq_months'>,
  monthIndex: number,
): boolean {
  const period = activityPeriodMonths(a);
  if (period <= 0) return false;
  return monthIndex % period === 0;
}

/**
 * Motor de visitas agrupadas (plano com frequência por serviço).
 * Gera 1 visita (OS) por MÊS ao longo de `horizonMonths`; no mês de índice k
 * (0-based a partir de `startDate`) entram só as atividades cujo período divide
 * k. Mês sem nenhuma atividade devida NÃO vira visita.
 *
 * Retorna a data da visita + os índices das atividades devidas (na ordem do
 * array `activities` recebido), pra o chamador montar o snapshot.
 */
export function generateGroupedVisits(
  startDate: Date,
  horizonMonths: number,
  activities: Pick<PlanActivityInput, 'freq_code' | 'freq_months'>[],
): { date: Date; activityIndexes: number[] }[] {
  const visits: { date: Date; activityIndexes: number[] }[] = [];
  // <= horizonMonths inclui o mês final (ex.: 12 meses → meses 0..12, mês 0 e 12
  // trazem as anuais), espelhando o comportamento de horizonte atual.
  for (let k = 0; k <= horizonMonths && visits.length < 120; k++) {
    const due: number[] = [];
    activities.forEach((a, idx) => {
      if (isActivityDueAtMonth(a, k)) due.push(idx);
    });
    if (due.length === 0) continue;
    visits.push({ date: addMonths(startDate, k), activityIndexes: due });
  }
  return visits;
}

/**
 * Linha do plano JÁ persistida (contract_plan_activities). Forma mínima usada
 * pelo form de edição pra repopular o editor "Serviços com frequência própria".
 */
export interface ContractPlanActivityRow {
  id: string;
  description: string;
  guidance: string | null;
  freq_code: string | null;
  freq_months: number | null;
  section: string | null;
  component: string | null;
  is_measurement: boolean;
  unit: string | null;
  expected_min: number | null;
  expected_max: number | null;
  contract_item_id: string | null;
  catalog_activity_id: string | null;
  applies_per_equipment: boolean;
  sort_order: number;
}

/**
 * Carrega o plano de serviços com frequência (contract_plan_activities) de UM
 * contrato. Usado pelo form de edição pra repopular o editor — componente nunca
 * lê supabase direto (hook é a fronteira). Só ativa quando há contractId.
 */
export function useContractPlanActivities(contractId: string | null | undefined) {
  return useQuery({
    queryKey: ['contract-plan-activities', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_plan_activities')
        .select('id, description, guidance, freq_code, freq_months, section, component, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, applies_per_equipment, sort_order')
        .eq('contract_id', contractId as string)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContractPlanActivityRow[];
    },
  });
}

/**
 * Status de OS que NUNCA são regenerados ao editar o cronograma do contrato.
 * Qualquer OS nesses estados (mesmo futura) carrega trabalho do técnico ou
 * decisão de negócio e é PRESERVADA intacta. Só OSs 'agendada'/'pendente' e
 * futuras entram no recálculo. Espelha a regra do diálogo de confirmação.
 */
export const REGENERABLE_OS_STATUSES = new Set(['agendada', 'pendente']);

/** Data de hoje (America/Sao_Paulo) como string YYYY-MM-DD, sem shift de TZ. */
function todayStrSaoPaulo(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date()); // en-CA → YYYY-MM-DD
}

/**
 * Parâmetros mínimos pra montar o cronograma de visitas de um contrato.
 * Compartilhado entre createContract e updateContract pra evitar divergência
 * entre criação e edição (mesmo motor, mesma bifurcação plano vs. legado).
 */
export interface BuildVisitsParams {
  startDate: Date;
  frequencyType: 'days' | 'months';
  frequencyValue: number;
  horizonMonths: number;
  /** Atividades já persistidas (com id) OU a persistir; idx alinhado a planActivityIds. */
  planActivities: PlanActivityInput[];
  /** IDs das linhas contract_plan_activities, alinhados por índice a planActivities. */
  planActivityIds: (string | null)[];
}

export interface BuiltVisit {
  date: Date;
  activities: { input: PlanActivityInput; planActivityId: string | null; sortOrder: number }[];
}

/**
 * Motor compartilhado de geração de visitas. Bifurca por EXISTÊNCIA de plano
 * (igual à criação): qualquer atividade no plano → motor agrupado (1 OS/mês);
 * nenhuma → cadência única legado (generateOccurrences). Atividades sem período
 * de cronograma (eventuais) não geram visita, mas continuam persistidas.
 *
 * `fromMonthStr` (opcional, YYYY-MM-DD) corta a série pra só datas >= esse dia —
 * usado na edição pra recriar apenas visitas futuras sem mexer no passado.
 */
export function buildContractVisits(params: BuildVisitsParams, fromMonthStr?: string): BuiltVisit[] {
  const { startDate, frequencyType, frequencyValue, horizonMonths, planActivities, planActivityIds } = params;
  const validActivities = planActivities.filter(a => a.description?.trim());

  const schedulable = validActivities
    .map((a, idx) => ({ a, planActivityId: planActivityIds[idx] ?? null }))
    .filter(({ a }) => activityPeriodMonths(a) > 0);

  const useGrouped = validActivities.length > 0;

  let visits: BuiltVisit[];
  if (useGrouped) {
    const grouped = generateGroupedVisits(startDate, horizonMonths, schedulable.map(({ a }) => a));
    visits = grouped.map(({ date, activityIndexes }) => ({
      date,
      activities: activityIndexes.map((ai, sortOrder) => ({
        input: schedulable[ai].a,
        planActivityId: schedulable[ai].planActivityId,
        sortOrder,
      })),
    }));
  } else {
    const dates = generateOccurrences(startDate, frequencyType, frequencyValue, horizonMonths);
    visits = dates.map(date => ({ date, activities: [] }));
  }

  if (fromMonthStr) {
    visits = visits.filter(v => {
      const y = v.date.getFullYear();
      const m = String(v.date.getMonth() + 1).padStart(2, '0');
      const d = String(v.date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}` >= fromMonthStr;
    });
  }

  return visits;
}

/**
 * Persiste UMA visita do contrato: service_order (status agendada, origin
 * contract) + junction de equipamentos + assignees + snapshot de atividades.
 * Compartilhado entre criação e regeneração na edição — fonte única do payload
 * da OS pra criação e edição não divergirem. Todo INSERT carrega company_id
 * (RLS multi-tenant bloqueia em silêncio sem ele). Retorna sucesso/erro.
 */
async function persistContractVisit(args: {
  companyId: string;
  contractId: string;
  visit: BuiltVisit;
  visitIndex: number;
  contractName: string;
  useGroupedEngine: boolean;
  customerId: string;
  technicianId: string | null;
  teamId: string | null;
  serviceTypeId: string | null;
  formTemplateId: string | null;
  equipmentIds: string[];
  /**
   * Resolve `contract_item_id` → `equipment_id` (Fase 3). Atividade amarrada a um
   * item específico vira 1 linha com o equipamento daquele item. Pode ser null
   * (item manual sem equipamento) — nesse caso a linha sai com equipment_id null.
   */
  itemEquipmentMap?: Record<string, string | null>;
  assigneeUserIds: string[];
  createdBy: string | null;
}): Promise<boolean> {
  const { visit, visitIndex } = args;
  const date = visit.date;
  // Date parts diretos — evita o shift de timezone do toISOString().
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  const description = args.useGroupedEngine
    ? `${args.contractName} — Visita ${visitIndex + 1}`
    : `${args.contractName} — Ocorrência ${visitIndex + 1}`;

  const osPayload = normalizeOptionalForeignKeys(
    {
      company_id: args.companyId,
      customer_id: args.customerId,
      equipment_id: args.equipmentIds.length === 1 ? args.equipmentIds[0] : null,
      technician_id: args.technicianId || null,
      team_id: args.teamId || null,
      os_type: 'manutencao_preventiva' as const,
      service_type_id: args.serviceTypeId || null,
      form_template_id: args.formTemplateId || null,
      scheduled_date: dateStr,
      scheduled_time: '08:00',
      description,
      require_tech_signature: true,
      status: 'agendada' as const,
      contract_id: args.contractId,
      origin: 'contract',
      created_by: args.createdBy,
    } as any,
    ['technician_id', 'team_id', 'service_type_id', 'form_template_id', 'equipment_id']
  );

  const { data: os, error: osError } = await supabase
    .from('service_orders')
    .insert(osPayload)
    .select('id')
    .single();

  if (osError) {
    console.error(`Error creating contract OS #${visitIndex + 1}:`, osError);
    return false;
  }

  if (args.equipmentIds.length > 0) {
    const { error: eqErr } = await supabase.from('service_order_equipment').insert(
      args.equipmentIds.map(eqId => ({
        service_order_id: os.id,
        equipment_id: eqId,
        form_template_id: args.formTemplateId || null,
      }))
    );
    if (eqErr) console.error('Error linking equipment:', eqErr);
  }

  if (args.assigneeUserIds.length > 0) {
    const { error: assignErr } = await supabase.from('service_order_assignees').insert(
      args.assigneeUserIds.map(uid => ({ service_order_id: os.id, user_id: uid }))
    );
    if (assignErr) console.error('Error creating assignees:', assignErr);
  }

  if (visit.activities.length > 0) {
    // Expansão por equipamento (Fase 3). Cada atividade da visita pode gerar
    // várias linhas de service_order_activities — uma por equipamento — pra o
    // técnico ter o checklist POR aparelho. Três casos, nesta ordem:
    //  1) atividade amarrada a um item específico (contract_item_id) → 1 linha
    //     com o equipment_id daquele item (resolvido pelo itemEquipmentMap);
    //  2) atividade "por equipamento" (applies_per_equipment !== false) → 1 linha
    //     POR equipamento do contrato (cada uma com seu equipment_id). Se o
    //     contrato não tem nenhum equipamento, cai pra 1 linha com null (não
    //     perde a atividade);
    //  3) atividade de LOCAL (applies_per_equipment === false) → 1 linha sem
    //     equipamento (equipment_id null).
    // sort_order é amigável pro campo: agrupa por equipamento e depois pela ordem
    // da atividade dentro da visita (visitas mostram split A inteiro, depois B…).
    const itemMap = args.itemEquipmentMap ?? {};
    const rows: any[] = [];
    let globalSort = 0;

    // Índice estável de cada equipamento (pra ordenar por aparelho primeiro).
    const eqIndex = new Map<string | null, number>();
    args.equipmentIds.forEach((eqId, i) => eqIndex.set(eqId, i));
    const LOCAL_BUCKET = args.equipmentIds.length; // linhas de local vão pro fim

    const baseRow = (a: PlanActivityInput, planActivityId: string | null, eqId: string | null, bucket: number, actSort: number) => ({
      company_id: args.companyId,
      service_order_id: os.id,
      plan_activity_id: planActivityId,
      equipment_id: eqId,
      section: a.section ?? null,
      component: a.component ?? null,
      description: a.description.trim(),
      guidance: a.guidance ?? null,
      freq_code: a.freq_code ?? null,
      is_measurement: a.is_measurement ?? false,
      unit: a.unit ?? null,
      expected_min: a.expected_min ?? null,
      expected_max: a.expected_max ?? null,
      _bucket: bucket,
      _actSort: actSort,
    });

    visit.activities.forEach(({ input: a, planActivityId, sortOrder }) => {
      if (a.contract_item_id) {
        // Caso 1: item específico → equipamento daquele item (pode ser null).
        const eqId = itemMap[a.contract_item_id] ?? null;
        const bucket = eqId != null ? (eqIndex.get(eqId) ?? LOCAL_BUCKET) : LOCAL_BUCKET;
        rows.push(baseRow(a, planActivityId, eqId, bucket, sortOrder));
      } else if (a.applies_per_equipment !== false && args.equipmentIds.length > 0) {
        // Caso 2: por equipamento → 1 linha por aparelho do contrato.
        args.equipmentIds.forEach((eqId) => {
          rows.push(baseRow(a, planActivityId, eqId, eqIndex.get(eqId) ?? 0, sortOrder));
        });
      } else {
        // Caso 3 (ou caso 2 sem equipamentos): linha de local / fallback.
        rows.push(baseRow(a, planActivityId, null, LOCAL_BUCKET, sortOrder));
      }
    });

    // Ordena por equipamento (bucket) e depois pela ordem da atividade, então
    // atribui sort_order sequencial estável pro campo.
    rows.sort((x, y) => (x._bucket - y._bucket) || (x._actSort - y._actSort));
    const finalRows = rows.map((r) => {
      const { _bucket, _actSort, ...rest } = r;
      return { ...rest, sort_order: globalSort++ };
    });

    const { error: actErr } = await supabase.from('service_order_activities').insert(finalRows as any);
    if (actErr) console.error('Error creating service order activities:', actErr);
  }

  return true;
}

/**
 * Sincroniza os ambientes climatizados (contract_environments) de um contrato
 * com o conjunto desejado, e religa cada equipamento ao seu ambiente via
 * contract_items.environment_id. Fonte única do diff de ambientes, usada por
 * updateContract e updateContractEnvironments (criar usa o caminho próprio).
 *
 *  - ambiente com `id` existente → UPDATE dos campos;
 *  - ambiente sem `id` (novo) → INSERT (company_id obrigatório p/ RLS);
 *  - ambiente persistido que sumiu do conjunto → DELETE (FK em contract_items é
 *    ON DELETE SET NULL → os itens daquele ambiente ficam com environment_id null);
 *  - depois, para CADA contract_item, seta environment_id pelo ambiente que
 *    reivindica seu equipment_id (um equipamento pertence a UM ambiente).
 *
 * Retorna se houve alguma mudança estrutural (insert/delete de ambiente ou
 * religação de algum item) — sinaliza pro chamador re-expandir visitas.
 */
async function syncContractEnvironments(args: {
  companyId: string;
  contractId: string;
  environments: ContractEnvironmentInput[];
}): Promise<boolean> {
  const { companyId, contractId, environments } = args;

  const { data: existingEnvs } = await supabase
    .from('contract_environments')
    .select('id')
    .eq('contract_id', contractId);
  const existingIds = new Set(((existingEnvs ?? []) as { id: string }[]).map(e => e.id));

  let changed = false;

  // Resolve cada ambiente do input pra um id real (existente ou recém-inserido)
  // e acumula o mapa equipment_id → environment_id.
  const equipmentToEnv: Record<string, string> = {};

  for (let i = 0; i < environments.length; i++) {
    const env = environments[i];
    const row = {
      identificacao: env.identificacao ?? null,
      tipo_atividade: env.tipo_atividade ?? null,
      area_climatizada_m2: env.area_climatizada_m2 ?? null,
      ocupantes_fixos: env.ocupantes_fixos ?? null,
      ocupantes_flutuantes: env.ocupantes_flutuantes ?? null,
      carga_termica_tr: env.carga_termica_tr ?? null,
      sort_order: i,
    };
    let envId = env.id && existingIds.has(env.id) ? env.id : null;
    if (envId) {
      await supabase.from('contract_environments').update(row as any).eq('id', envId);
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('contract_environments')
        .insert({ company_id: companyId, contract_id: contractId, ...row } as any)
        .select('id')
        .single();
      if (insErr) throw insErr;
      envId = (inserted as { id: string }).id;
      changed = true;
    }
    for (const eqId of env.equipment_ids) {
      if (eqId) equipmentToEnv[eqId] = envId;
    }
  }

  // Remove ambientes que sumiram do conjunto (FK SET NULL desliga os itens).
  const keepIds = new Set(
    environments.map(e => e.id).filter((x): x is string => !!x && existingIds.has(x)),
  );
  const toRemove = [...existingIds].filter(id => !keepIds.has(id));
  if (toRemove.length > 0) {
    await supabase.from('contract_environments').delete().in('id', toRemove);
    changed = true;
  }

  // Religa cada contract_item ao ambiente do seu equipamento. Só faz UPDATE
  // quando o vínculo realmente muda (idempotente).
  const { data: itemRows } = await supabase
    .from('contract_items')
    .select('id, equipment_id, environment_id')
    .eq('contract_id', contractId);
  for (const it of (itemRows ?? []) as { id: string; equipment_id: string | null; environment_id: string | null }[]) {
    const desired = it.equipment_id ? (equipmentToEnv[it.equipment_id] ?? null) : null;
    if ((it.environment_id ?? null) !== desired) {
      await supabase.from('contract_items').update({ environment_id: desired } as any).eq('id', it.id);
      changed = true;
    }
  }

  return changed;
}

export function getFrequencyLabel(type: string, value: number): string {
  if (type === 'months') {
    const labels: Record<number, string> = { 1: 'Mensal', 2: 'Bimestral', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };
    return labels[value] || `A cada ${value} meses`;
  }
  const dayLabels: Record<number, string> = { 7: 'Semanal', 15: 'Quinzenal', 30: 'A cada 30 dias', 45: 'A cada 45 dias', 60: 'A cada 60 dias', 90: 'A cada 90 dias' };
  return dayLabels[value] || `A cada ${value} dias`;
}

export function useContracts() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          customers (id, name, document, address, city, state),
          customer:customers (id, name),
          responsible_technicians:responsible_technician_id (id, full_name, cft_crea, modality),
          contract_items (id, contract_id, equipment_id, environment_id, item_name, item_description, form_template_id, sort_order, equipment:equipment(id, name, brand, model)),
          contract_environments (id, company_id, contract_id, identificacao, tipo_atividade, area_climatizada_m2, ocupantes_fixos, ocupantes_flutuantes, carga_termica_tr, sort_order),
          service_orders (id, order_number, status, scheduled_date)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as Contract[];
    },
  });

  const createContract = useMutation({
    mutationFn: async (input: {
      name: string;
      customer_id: string;
      technician_id?: string | null;
      team_id?: string | null;
      assignee_user_ids?: string[];
      billing_responsible_ids?: string[];
      service_type_id?: string | null;
      form_template_id?: string | null;
      status: string;
      notes?: string | null;
      frequency_type: string;
      frequency_value: number;
      start_date: string;
      horizon_months: number;
      // PMOC (Onda A). Quando true, `responsible_technician_id` é obrigatório (a UI valida antes
      // de chamar). `next_pmoc_generation_date` é calculado se vier vazio na criação.
      is_pmoc?: boolean;
      responsible_technician_id?: string | null;
      pmoc_legal_compliance_text?: string | null;
      next_pmoc_generation_date?: string | null;
      // Seção 1 da Planilha PMOC — identificação da UNIDADE/local do contrato
      // (1 contrato = 1 loja/site, endereço pode ser próprio ≠ do cliente).
      // Opcionais; só fazem sentido em contrato PMOC.
      unidade_nome?: string | null;
      unidade_endereco?: string | null;
      unidade_numero?: string | null;
      unidade_complemento?: string | null;
      unidade_bairro?: string | null;
      unidade_cidade?: string | null;
      unidade_uf?: string | null;
      unidade_cep?: string | null;
      // Seção 4 da Planilha PMOC — caracterização do ambiente climatizado
      // (modelo do cliente). Opcionais; só fazem sentido em contrato PMOC.
      pmoc_tipo_atividade?: string | null;
      pmoc_identificacao_ambiente?: string | null;
      pmoc_area_climatizada_m2?: number | null;
      pmoc_ocupantes_fixos?: number | null;
      pmoc_ocupantes_flutuantes?: number | null;
      pmoc_carga_termica_tr?: number | null;
      items: { equipment_id?: string | null; item_name: string; item_description?: string | null; form_template_id?: string | null }[];
      // Ambientes climatizados (multi-ambiente PMOC). Quando definido, cada
      // ambiente vira uma linha em contract_environments e seus equipment_ids
      // recebem o environment_id correspondente em contract_items. Itens sem
      // ambiente (não-PMOC) ficam com environment_id null.
      environments?: ContractEnvironmentInput[];
      // Plano de serviços com frequência por linha (Fase 1 — frequências por
      // serviço). Quando vazio, o contrato cai no comportamento de frequência
      // única (legado): generateOccurrences + cadência única. Quando tem ao
      // menos uma atividade válida, o motor de visitas agrupadas assume.
      plan_activities?: PlanActivityInput[];
    }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id || '')
        .single();

      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      // Quando PMOC e a próxima geração não foi informada, calculamos a partir da
      // primeira ocorrência (start_date + frequência) — mesma lógica de generateOccurrences,
      // pegando a segunda data da série (ou a primeira se só tiver uma).
      let nextPmocGenerationDate = input.next_pmoc_generation_date ?? null;
      if (input.is_pmoc && !nextPmocGenerationDate) {
        const dates = generateOccurrences(
          new Date(input.start_date + 'T12:00:00'),
          input.frequency_type as 'days' | 'months',
          input.frequency_value,
          input.horizon_months
        );
        const target = dates[1] ?? dates[0];
        if (target) {
          const y = target.getFullYear();
          const m = String(target.getMonth() + 1).padStart(2, '0');
          const d = String(target.getDate()).padStart(2, '0');
          nextPmocGenerationDate = `${y}-${m}-${d}`;
        }
      }

      const contractPayload = normalizeOptionalForeignKeys(
        {
          company_id: profile.company_id,
          name: input.name,
          customer_id: input.customer_id,
          technician_id: input.technician_id,
          team_id: input.team_id,
          service_type_id: input.service_type_id,
          form_template_id: input.form_template_id,
          status: input.status,
          notes: input.notes || null,
          frequency_type: input.frequency_type,
          frequency_value: input.frequency_value,
          start_date: input.start_date,
          horizon_months: input.horizon_months,
          billing_responsible_ids: input.billing_responsible_ids || [],
          // PMOC
          is_pmoc: input.is_pmoc ?? false,
          responsible_technician_id: input.is_pmoc ? (input.responsible_technician_id ?? null) : null,
          pmoc_legal_compliance_text: input.is_pmoc
            ? (input.pmoc_legal_compliance_text ?? 'Conforme Lei Federal 13.589/2018')
            : null,
          next_pmoc_generation_date: input.is_pmoc ? nextPmocGenerationDate : null,
          // Identificação da UNIDADE (Seção 1 da Planilha). Só grava em PMOC;
          // contrato comum zera os 8 campos.
          unidade_nome: input.is_pmoc ? (input.unidade_nome ?? null) : null,
          unidade_endereco: input.is_pmoc ? (input.unidade_endereco ?? null) : null,
          unidade_numero: input.is_pmoc ? (input.unidade_numero ?? null) : null,
          unidade_complemento: input.is_pmoc ? (input.unidade_complemento ?? null) : null,
          unidade_bairro: input.is_pmoc ? (input.unidade_bairro ?? null) : null,
          unidade_cidade: input.is_pmoc ? (input.unidade_cidade ?? null) : null,
          unidade_uf: input.is_pmoc ? (input.unidade_uf ?? null) : null,
          unidade_cep: input.is_pmoc ? (input.unidade_cep ?? null) : null,
          // Caracterização do ambiente climatizado migrou para contract_environments
          // (multi-ambiente). Os 6 campos pmoc_* únicos viraram legado e ficam null.
          pmoc_tipo_atividade: null,
          pmoc_identificacao_ambiente: null,
          pmoc_area_climatizada_m2: null,
          pmoc_ocupantes_fixos: null,
          pmoc_ocupantes_flutuantes: null,
          pmoc_carga_termica_tr: null,
          created_by: user?.id || null,
        } as any,
        ['technician_id', 'team_id', 'service_type_id', 'form_template_id', 'responsible_technician_id']
      );

      const { data: contract, error } = await supabase
        .from('contracts')
        .insert(contractPayload)
        .select('id')
        .single();

      if (error) throw error;

      // Ambientes climatizados (multi-ambiente PMOC). Inserimos ANTES dos itens
      // pra resolver o id gerado de cada ambiente e mapear equipment_id →
      // environment_id. RLS exige company_id no INSERT. Cada equipamento
      // pertence a UM ambiente (o último ambiente que o reivindica ganha).
      const equipmentToEnvironment: Record<string, string> = {};
      const environments = input.environments ?? [];
      if (environments.length > 0) {
        const { data: insertedEnvs, error: envError } = await supabase
          .from('contract_environments')
          .insert(
            environments.map((env, i) => ({
              company_id: profile.company_id,
              contract_id: (contract as any).id,
              identificacao: env.identificacao ?? null,
              tipo_atividade: env.tipo_atividade ?? null,
              area_climatizada_m2: env.area_climatizada_m2 ?? null,
              ocupantes_fixos: env.ocupantes_fixos ?? null,
              ocupantes_flutuantes: env.ocupantes_flutuantes ?? null,
              carga_termica_tr: env.carga_termica_tr ?? null,
              sort_order: i,
            })) as any
          )
          .select('id');
        if (envError) throw envError;
        const envRows = (insertedEnvs ?? []) as { id: string }[];
        environments.forEach((env, i) => {
          const envId = envRows[i]?.id;
          if (!envId) return;
          for (const eqId of env.equipment_ids) {
            if (eqId) equipmentToEnvironment[eqId] = envId;
          }
        });
      }

      // Create items. Capturamos os ids gerados pra montar o itemEquipmentMap
      // (contract_item_id → equipment_id) usado na expansão por equipamento.
      const itemEquipmentMap: Record<string, string | null> = {};
      if (input.items.length > 0) {
        const { data: insertedItems, error: itemError } = await supabase.from('contract_items').insert(
          input.items.map((item, i) => ({
            contract_id: (contract as any).id,
            equipment_id: item.equipment_id || null,
            // Liga o item ao ambiente do seu equipamento (PMOC multi-ambiente).
            // Item sem equipamento ou sem ambiente → null (caso flat/comum).
            environment_id: item.equipment_id ? (equipmentToEnvironment[item.equipment_id] ?? null) : null,
            item_name: item.item_name,
            item_description: item.item_description || null,
            form_template_id: item.form_template_id || null,
            sort_order: i,
          })) as any
        ).select('id, equipment_id');
        if (itemError) throw itemError;
        for (const it of (insertedItems ?? []) as { id: string; equipment_id: string | null }[]) {
          itemEquipmentMap[it.id] = it.equipment_id ?? null;
        }
      }

      // Plano de serviços com frequência (Fase 1). Persistimos as atividades
      // válidas (com período de cronograma > 0 OU eventual 'E', que fica
      // registrada mas não gera OS). RLS de contract_plan_activities exige
      // company_id no INSERT — sem isso o insert é bloqueado em silêncio.
      const planActivities = (input.plan_activities ?? []).filter(a => a.description?.trim());
      let insertedPlanActivities: { id: string }[] = [];
      if (planActivities.length > 0) {
        const { data: planRows, error: planError } = await supabase
          .from('contract_plan_activities')
          .insert(
            planActivities.map((a, i) => ({
              company_id: profile.company_id,
              contract_id: (contract as any).id,
              contract_item_id: a.contract_item_id ?? null,
              catalog_activity_id: a.catalog_activity_id ?? null,
              section: a.section ?? null,
              component: a.component ?? null,
              description: a.description.trim(),
              guidance: a.guidance ?? null,
              freq_code: a.freq_code ?? null,
              freq_months: a.freq_months ?? null,
              is_measurement: a.is_measurement ?? false,
              unit: a.unit ?? null,
              expected_min: a.expected_min ?? null,
              expected_max: a.expected_max ?? null,
              applies_per_equipment: a.applies_per_equipment ?? true,
              is_active: true,
              sort_order: i,
            })) as any
          )
          .select('id');
        if (planError) throw planError;
        insertedPlanActivities = (planRows ?? []) as { id: string }[];
      }

      let osCreatedCount = 0;
      let osErrorCount = 0;
      let expectedOsCount = 0;

      // Geração imediata de OSs para TODOS os contratos ativos (PMOC ou comum).
      // O cron `generate-pmoc-orders` foi desabilitado: PMOC agora gera as N OSs
      // no momento da criação, igual a um contrato comum. O campo
      // `next_pmoc_generation_date` permanece como informação legada/futuro
      // auto-renew, mas não dispara mais cron.
      // Generate OSs and occurrences
      if (input.status === 'active') {
        const startBase = new Date(input.start_date + 'T12:00:00');

        // Atividades do plano que entram no cronograma automático (período > 0).
        // Eventuais ('E') ou sem frequência ficam de fora da geração (mas já
        // foram persistidas em contract_plan_activities acima).
        const schedulableActivities = planActivities
          .map((a, idx) => ({ a, planActivityId: insertedPlanActivities[idx]?.id ?? null }))
          .filter(({ a }) => activityPeriodMonths(a) > 0);

        // Bifurcação por EXISTÊNCIA de plano, não por schedulable. Se o contrato
        // tem plano mas todas as atividades são Eventuais ('E') / sem período,
        // `schedulableActivities` é 0 → o motor agrupado retorna [] visitas →
        // 0 OS, batendo com a prévia do form. Bifurcar por `schedulableActivities`
        // caía no legado e gerava OSs pela frequência única do contrato,
        // divergindo da prévia. Contrato SEM plano → legado intacto.
        const useGroupedEngine = planActivities.length > 0;

        // visits: cada item é uma OS a gerar, com a lista de atividades (snapshot)
        // que vencem naquela visita. No modo legado (sem plano), a lista fica
        // vazia e o comportamento é exatamente o de frequência única atual.
        type VisitPlan = { date: Date; activities: { input: PlanActivityInput; planActivityId: string | null; sortOrder: number }[] };
        let visits: VisitPlan[];

        if (useGroupedEngine) {
          // Motor de visitas agrupadas: 1 OS/mês = união do que vence.
          const grouped = generateGroupedVisits(
            startBase,
            input.horizon_months,
            schedulableActivities.map(({ a }) => a),
          );
          visits = grouped.map(({ date, activityIndexes }) => ({
            date,
            activities: activityIndexes.map((ai, sortOrder) => ({
              input: schedulableActivities[ai].a,
              planActivityId: schedulableActivities[ai].planActivityId,
              sortOrder,
            })),
          }));
        } else {
          // Legado: cadência única (frequência do contrato), sem snapshot de atividades.
          const occurrenceDates = generateOccurrences(
            startBase,
            input.frequency_type as 'days' | 'months',
            input.frequency_value,
            input.horizon_months
          );
          visits = occurrenceDates.map(date => ({ date, activities: [] }));
        }

        expectedOsCount = visits.length;

        const equipmentIds = input.items
          .filter(i => i.equipment_id)
          .map(i => i.equipment_id!);

        // Determine all user IDs that should be assignees
        const assigneeUserIds = input.assignee_user_ids && input.assignee_user_ids.length > 0
          ? input.assignee_user_ids
          : (input.technician_id ? [input.technician_id] : []);

        for (let i = 0; i < visits.length; i++) {
          // persistContractVisit é a fonte única do payload da OS (mesma usada
          // na regeneração da edição). RLS de service_orders exige company_id no
          // INSERT (WITH CHECK get_user_company_id) — garantido lá dentro.
          // A OS recorrente JÁ é a visita do contrato (sem tabela-sombra).
          const ok = await persistContractVisit({
            companyId: profile.company_id,
            contractId: (contract as any).id,
            visit: visits[i],
            visitIndex: i,
            contractName: input.name,
            useGroupedEngine,
            customerId: input.customer_id,
            technicianId: input.technician_id || null,
            teamId: input.team_id || null,
            serviceTypeId: input.service_type_id || null,
            formTemplateId: input.form_template_id || null,
            equipmentIds,
            itemEquipmentMap,
            assigneeUserIds,
            createdBy: user?.id || null,
          });
          if (ok) osCreatedCount++;
          else osErrorCount++;
        }

        if (osErrorCount > 0) {
          toast({ variant: 'destructive', title: `${osErrorCount} OS(s) falharam ao ser criadas`, description: `${osCreatedCount} de ${expectedOsCount} criadas com sucesso.` });
        }
      }

      return {
        id: (contract as any).id,
        generatedOsCount: osCreatedCount,
        expectedOsCount,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast({ title: 'Contrato criado com sucesso!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao criar contrato', description: getErrorMessage(e) }),
  });

  /**
   * Aplica conta bancária / categoria (e cliente, se faltar) a TODAS as parcelas
   * (financial_transactions) de um contrato de uma vez. Resolve contratos antigos
   * cujas parcelas nasceram sem vínculo de conta/categoria (ex.: "Daluz Galpão"
   * com 48 parcelas). Idempotente: rodar de novo só reescreve os mesmos valores.
   *
   * - `account_id` e `category` só entram no update quando informados (não apaga
   *   o que já existe se o gestor deixar em branco).
   * - `customer_id` é sempre garantido (todas as parcelas do contrato são do
   *   mesmo cliente do contrato).
   */
  const applyFinancialLinksToContractParcels = useMutation({
    mutationFn: async (input: {
      contractId: string;
      customerId: string;
      accountId?: string | null;
      category?: string | null;
    }) => {
      const patch: Record<string, any> = { customer_id: input.customerId };
      if (input.accountId) patch.account_id = input.accountId;
      if (input.category) patch.category = input.category;

      const { data, error } = await supabase
        .from('financial_transactions')
        .update(patch as any)
        .eq('contract_id', input.contractId)
        .select('id');

      if (error) throw error;
      return { updatedCount: (data || []).length };
    },
    onSuccess: ({ updatedCount }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      queryClient.invalidateQueries({ queryKey: ['contract-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      toast({
        title: updatedCount > 0
          ? `Vínculos aplicados a ${updatedCount} parcela${updatedCount > 1 ? 's' : ''}`
          : 'Nenhuma parcela para atualizar',
      });
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro ao aplicar vínculos', description: getErrorMessage(e) }),
  });

  const updateContractStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('contracts').update({ status } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Status do contrato atualizado!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao atualizar status', description: getErrorMessage(e) }),
  });

  /**
   * Atualiza campos editáveis do contrato. Quando muda algo que afeta o
   * cronograma (start_date, frequência, horizonte OU o plano de serviços) E o
   * contrato está ativo, REGENERA as visitas FUTURAS não-tocadas:
   *
   *  - DELETA+recria só OSs 'agendada'/'pendente' com scheduled_date >= hoje.
   *  - PRESERVA intactas: OSs passadas e qualquer OS com status não-regenerável
   *    (concluida, em_andamento, a_caminho, pausada, cancelada) — trabalho do
   *    técnico nunca é destruído.
   *  - financial_transactions NÃO são tocadas (billing mensal é separado).
   *
   * O plano editado (plan_activities) substitui contract_plan_activities. Sem
   * mudança de cronograma → só UPDATE da linha (comportamento legado).
   * Inclui campos PMOC (Onda A). Idempotente: salvar 2x não duplica visitas.
   */
  const updateContract = useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      customer_id?: string;
      technician_id?: string | null;
      team_id?: string | null;
      assignee_user_ids?: string[];
      service_type_id?: string | null;
      form_template_id?: string | null;
      status?: string;
      notes?: string | null;
      frequency_type?: string;
      frequency_value?: number;
      start_date?: string;
      horizon_months?: number;
      billing_responsible_ids?: string[];
      // Plano de serviços com frequência (Fase 1). Quando definido (mesmo vazio),
      // substitui o plano persistido. `undefined` = não mexe no plano.
      plan_activities?: PlanActivityInput[];
      // Equipamentos/itens do contrato (Fase 3). Quando definido, aplica diff em
      // contract_items (insere novos, apaga removidos, mantém iguais). Mudança no
      // conjunto de equipamentos conta como mudança de cronograma → re-expande as
      // visitas futuras pelo novo conjunto. `undefined` = não mexe nos itens.
      items?: { equipment_id?: string | null; item_name: string; item_description?: string | null; form_template_id?: string | null }[];
      // Ambientes climatizados (multi-ambiente PMOC). Quando definido, aplica
      // diff em contract_environments (insere/atualiza/remove) e seta o
      // environment_id dos contract_items pelos equipment_ids de cada ambiente.
      // `undefined` = não mexe nos ambientes.
      environments?: ContractEnvironmentInput[];
      // PMOC
      is_pmoc?: boolean;
      responsible_technician_id?: string | null;
      pmoc_legal_compliance_text?: string | null;
      next_pmoc_generation_date?: string | null;
      // Identificação da UNIDADE (Seção 1 da Planilha). `undefined` = não mexe.
      unidade_nome?: string | null;
      unidade_endereco?: string | null;
      unidade_numero?: string | null;
      unidade_complemento?: string | null;
      unidade_bairro?: string | null;
      unidade_cidade?: string | null;
      unidade_uf?: string | null;
      unidade_cep?: string | null;
    }) => {
      const { id, assignee_user_ids, plan_activities, items, environments, ...rest } = input;

      // Empresa do usuário (RLS exige company_id em todo INSERT novo).
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id || '')
        .single();
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      // Contrato atual — base de comparação pra detectar mudança de cronograma.
      const { data: current, error: curErr } = await supabase
        .from('contracts')
        .select('start_date, frequency_type, frequency_value, horizon_months, status, customer_id, name, technician_id, team_id')
        .eq('id', id)
        .single();
      if (curErr) throw curErr;

      // 1) UPDATE da linha do contrato. Os 6 campos pmoc_* únicos viraram legado
      //    (caracterização migrou pra contract_environments) e NÃO são mais
      //    gravados aqui — ficam null/legado no banco.
      const payload: any = { ...rest };
      if (input.is_pmoc === false) {
        payload.responsible_technician_id = null;
        payload.next_pmoc_generation_date = null;
        // Desligar PMOC limpa a identificação da unidade (Seção 1).
        payload.unidade_nome = null;
        payload.unidade_endereco = null;
        payload.unidade_numero = null;
        payload.unidade_complemento = null;
        payload.unidade_bairro = null;
        payload.unidade_cidade = null;
        payload.unidade_uf = null;
        payload.unidade_cep = null;
      }
      const { error: updErr } = await supabase.from('contracts').update(payload).eq('id', id);
      if (updErr) throw updErr;

      // 1.5) Propagar os responsáveis pela execução para as OSs ainda NÃO
      //      realizadas deste contrato (PMOC ou comum). Regra do CEO: ao editar
      //      o técnico/equipe do contrato, toda OS não concluída/cancelada passa
      //      a apontar pro novo responsável. A regra de negócio (quais OSs, quais
      //      status) vive na RPC server-side `reassign_contract_pending_orders`.
      //
      //      ⚠️ SÓ propaga quando o responsável REALMENTE mudou. Antes a RPC
      //      rodava em toda edição que tocasse technician_id/team_id no payload —
      //      sobrescrevendo reatribuições manuais feitas em OSs específicas mesmo
      //      quando o gestor não mexeu nos responsáveis do contrato. Comparamos
      //      o valor novo (input) com o atual (current) normalizando null/''/
      //      undefined pra "sem responsável".
      //
      //      Best-effort: se a RPC ainda não existir no banco, não derruba o save
      //      (a edição do contrato já foi aplicada).
      let reassignedCount = 0;
      const norm = (v: string | null | undefined) => (v == null || v === '' ? null : v);
      // Valor desejado: se o campo não veio no input (`undefined`), mantém o
      // atual do contrato — ou seja, não houve intenção de mudar.
      const nextTechnician = input.technician_id !== undefined ? norm(input.technician_id) : norm(current?.technician_id);
      const nextTeam = input.team_id !== undefined ? norm(input.team_id) : norm(current?.team_id);
      const responsibleChanged =
        nextTechnician !== norm(current?.technician_id) || nextTeam !== norm(current?.team_id);

      if (responsibleChanged) {
        try {
          const { data: reassigned, error: reassignErr } = await supabase.rpc(
            'reassign_contract_pending_orders',
            {
              p_contract_id: id,
              p_technician_id: nextTechnician,
              p_team_id: nextTeam,
            },
          );
          if (reassignErr) throw reassignErr;
          reassignedCount = typeof reassigned === 'number' ? reassigned : 0;
        } catch (e) {
          // RPC ausente/falha → não interrompe o fluxo de edição do contrato.
          console.warn('reassign_contract_pending_orders falhou (ignorado):', e);
        }
      }

      // 2) Persistir o plano editado (substituição completa). Só quando
      //    plan_activities foi informado. Eventuais ('E') ficam registrados mas
      //    não geram visita. RLS exige company_id no INSERT.
      let planChanged = false;
      let insertedPlanRows: { id: string }[] = [];
      const newPlan = (plan_activities ?? []).filter(a => a.description?.trim());

      if (plan_activities !== undefined) {
        // Compara plano novo vs. atual (descrição + frequência) pra saber se o
        // cronograma mudou por causa do plano.
        const { data: existingPlan } = await supabase
          .from('contract_plan_activities')
          .select('description, freq_code, freq_months, applies_per_equipment')
          .eq('contract_id', id)
          .order('sort_order', { ascending: true });
        const sig = (arr: any[]) =>
          (arr || [])
            .map(a => `${(a.description || '').trim()}|${a.freq_code ?? ''}|${a.freq_months ?? ''}|${a.applies_per_equipment === false ? '0' : '1'}`)
            .join('§');
        planChanged = sig(existingPlan || []) !== sig(newPlan);

        if (planChanged) {
          await supabase.from('contract_plan_activities').delete().eq('contract_id', id);
          if (newPlan.length > 0) {
            const { data: planRows, error: planErr } = await supabase
              .from('contract_plan_activities')
              .insert(
                newPlan.map((a, i) => ({
                  company_id: profile.company_id,
                  contract_id: id,
                  contract_item_id: a.contract_item_id ?? null,
                  catalog_activity_id: a.catalog_activity_id ?? null,
                  section: a.section ?? null,
                  component: a.component ?? null,
                  description: a.description.trim(),
                  guidance: a.guidance ?? null,
                  freq_code: a.freq_code ?? null,
                  freq_months: a.freq_months ?? null,
                  is_measurement: a.is_measurement ?? false,
                  unit: a.unit ?? null,
                  expected_min: a.expected_min ?? null,
                  expected_max: a.expected_max ?? null,
                  applies_per_equipment: a.applies_per_equipment ?? true,
                  is_active: true,
                  sort_order: i,
                })) as any
              )
              .select('id');
            if (planErr) throw planErr;
            insertedPlanRows = (planRows ?? []) as { id: string }[];
          }
        } else {
          // Plano não mudou — recupera os ids existentes pra reaproveitar no
          // snapshot caso o cronograma seja regenerado por outro motivo.
          const { data: planRows } = await supabase
            .from('contract_plan_activities')
            .select('id')
            .eq('contract_id', id)
            .order('sort_order', { ascending: true });
          insertedPlanRows = (planRows ?? []) as { id: string }[];
        }
      }

      // 2.5) Diff de equipamentos/itens do contrato (Fase 3). Só quando `items`
      //      foi informado. Compara o conjunto atual vs. o novo por uma chave
      //      estável (equipment_id || nome do item manual) e aplica:
      //        - insere itens novos (que não existiam);
      //        - apaga itens removidos (com suas dependências);
      //        - mantém intactos os iguais (idempotente: salvar 2x não recria).
      //      Mudança no conjunto conta como mudança de cronograma → as visitas
      //      futuras re-expandem pelo novo conjunto de aparelhos.
      let itemsChanged = false;
      if (items !== undefined) {
        const { data: existingItems } = await supabase
          .from('contract_items')
          .select('id, equipment_id, item_name')
          .eq('contract_id', id);
        const itemKey = (it: { equipment_id?: string | null; item_name: string }) =>
          it.equipment_id ? `eq:${it.equipment_id}` : `manual:${(it.item_name || '').trim().toLowerCase()}`;

        const existingByKey = new Map<string, { id: string }>();
        for (const it of (existingItems ?? []) as { id: string; equipment_id: string | null; item_name: string }[]) {
          existingByKey.set(itemKey(it), { id: it.id });
        }
        const newKeys = new Set(items.map(itemKey));

        // Itens a inserir = chaves novas que não existem hoje.
        const toInsert = items.filter(it => !existingByKey.has(itemKey(it)));
        // Itens a remover = existentes cuja chave não está mais no conjunto novo.
        const toRemoveIds = (existingItems ?? [])
          .filter((it: any) => !newKeys.has(itemKey(it)))
          .map((it: any) => it.id) as string[];

        if (toRemoveIds.length > 0) {
          // contract_items não tem dependentes fortes (snapshot já está na OS);
          // delete direto. As OSs futuras são refeitas logo abaixo.
          await supabase.from('contract_items').delete().in('id', toRemoveIds);
          itemsChanged = true;
        }
        if (toInsert.length > 0) {
          const baseSort = (existingItems ?? []).length;
          const { error: insErr } = await supabase.from('contract_items').insert(
            toInsert.map((item, i) => ({
              contract_id: id,
              equipment_id: item.equipment_id || null,
              item_name: item.item_name,
              item_description: item.item_description || null,
              form_template_id: item.form_template_id || null,
              sort_order: baseSort + i,
            })) as any
          );
          if (insErr) throw insErr;
          itemsChanged = true;
        }
      }

      // 2.6) Ambientes climatizados (multi-ambiente PMOC). Só quando
      //       `environments` foi informado. Roda DEPOIS do diff de itens (2.5)
      //       pra os contract_items já existirem na hora de religar o
      //       environment_id. Mudança estrutural de ambiente/religação conta
      //       como mudança de organização — NÃO afeta o cronograma (o motor de
      //       visitas continua expandindo pelo conjunto de equipamentos).
      if (environments !== undefined) {
        await syncContractEnvironments({
          companyId: profile.company_id,
          contractId: id,
          environments,
        });
      }

      // 3) Detectar mudança de cronograma.
      const scheduleFieldChanged =
        (input.start_date !== undefined && input.start_date !== current.start_date) ||
        (input.frequency_type !== undefined && input.frequency_type !== current.frequency_type) ||
        (input.frequency_value !== undefined && input.frequency_value !== current.frequency_value) ||
        (input.horizon_months !== undefined && input.horizon_months !== current.horizon_months);

      const newStatus = (input.status ?? current.status) as string;
      const scheduleChanged = scheduleFieldChanged || planChanged || itemsChanged;

      // Sem mudança de cronograma OU contrato inativo → para por aqui (legado).
      if (!scheduleChanged || newStatus !== 'active') {
        return { regenerated: false, deletedCount: 0, createdCount: 0, reassignedCount };
      }

      // 4) Regenerar visitas futuras não-tocadas.
      const todayStr = todayStrSaoPaulo();

      const { data: contractOss } = await supabase
        .from('service_orders')
        .select('id, scheduled_date, status')
        .eq('contract_id', id);

      // Regeneráveis: status agendada/pendente E futuras (scheduled_date >= hoje).
      const regenerableIds = (contractOss || [])
        .filter(o =>
          REGENERABLE_OS_STATUSES.has(o.status ?? '') &&
          (o.scheduled_date ?? '') >= todayStr
        )
        .map(o => o.id)
        .filter(Boolean) as string[];

      if (regenerableIds.length > 0) {
        // Mesma sequência de limpeza do executeDeleteContract (dependentes →
        // OS). financial_transactions NÃO são tocadas.
        await supabase.from('service_order_assignees').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_order_equipment').delete().in('service_order_id', regenerableIds);
        await supabase.from('form_responses').delete().in('service_order_id', regenerableIds);
        await supabase.from('os_photos').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_ratings').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_order_activities').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_orders').delete().in('id', regenerableIds);
      }

      // Parâmetros efetivos (input quando veio, senão o atual).
      const effStart = (input.start_date ?? current.start_date) as string;
      const effFreqType = (input.frequency_type ?? current.frequency_type) as 'days' | 'months';
      const effFreqValue = (input.frequency_value ?? current.frequency_value) as number;
      const effHorizon = (input.horizon_months ?? current.horizon_months) as number;

      // Plano efetivo pra geração: o novo (se informado) ou o persistido atual.
      let effPlan: PlanActivityInput[] = newPlan;
      let effPlanIds: (string | null)[] = insertedPlanRows.map(r => r.id);
      if (plan_activities === undefined) {
        // Plano não veio no input → usar o que já está no banco.
        const { data: persisted } = await supabase
          .from('contract_plan_activities')
          .select('id, description, guidance, section, component, freq_code, freq_months, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, applies_per_equipment')
          .eq('contract_id', id)
          .order('sort_order', { ascending: true });
        effPlan = (persisted ?? []).map((a: any) => ({
          description: a.description,
          guidance: a.guidance,
          section: a.section,
          component: a.component,
          freq_code: a.freq_code,
          freq_months: a.freq_months,
          is_measurement: a.is_measurement,
          unit: a.unit,
          expected_min: a.expected_min,
          expected_max: a.expected_max,
          contract_item_id: a.contract_item_id,
          catalog_activity_id: a.catalog_activity_id,
          applies_per_equipment: a.applies_per_equipment,
        }));
        effPlanIds = (persisted ?? []).map((a: any) => a.id);
      } else if (!planChanged) {
        // Plano informado mas igual ao persistido → reusar ids existentes.
        effPlanIds = insertedPlanRows.map(r => r.id);
      }

      const useGroupedEngine = effPlan.length > 0;

      // Gera só visitas do mês de hoje em diante (passado preservado).
      const visits = buildContractVisits(
        {
          startDate: new Date(effStart + 'T12:00:00'),
          frequencyType: effFreqType,
          frequencyValue: effFreqValue,
          horizonMonths: effHorizon,
          planActivities: effPlan,
          planActivityIds: effPlanIds,
        },
        todayStr,
      );

      // Itens/equipamentos e executores do contrato pra reidratar as OSs novas.
      // Lê DEPOIS do diff (2.5) → já reflete o novo conjunto de equipamentos.
      const { data: contractItemsRows } = await supabase
        .from('contract_items')
        .select('id, equipment_id')
        .eq('contract_id', id);
      const equipmentIds = (contractItemsRows ?? [])
        .map((i: any) => i.equipment_id)
        .filter(Boolean) as string[];
      // Mapa item→equipamento pra atividades amarradas a um item específico.
      const itemEquipmentMap: Record<string, string | null> = {};
      for (const it of (contractItemsRows ?? []) as { id: string; equipment_id: string | null }[]) {
        itemEquipmentMap[it.id] = it.equipment_id ?? null;
      }

      const effTechnicianId = input.technician_id !== undefined ? input.technician_id : null;
      const effTeamId = input.team_id !== undefined ? input.team_id : null;
      const assigneeUserIds = assignee_user_ids && assignee_user_ids.length > 0
        ? assignee_user_ids
        : (effTechnicianId ? [effTechnicianId] : []);

      const effName = (input.name ?? current.name ?? '') || 'Contrato';
      const effCustomerId = (input.customer_id ?? current.customer_id) as string;
      let createdCount = 0;
      for (let i = 0; i < visits.length; i++) {
        const ok = await persistContractVisit({
          companyId: profile.company_id,
          contractId: id,
          visit: visits[i],
          visitIndex: i,
          contractName: effName,
          useGroupedEngine,
          customerId: effCustomerId,
          technicianId: effTechnicianId,
          teamId: effTeamId,
          serviceTypeId: input.service_type_id ?? null,
          formTemplateId: input.form_template_id ?? null,
          equipmentIds,
          itemEquipmentMap,
          assigneeUserIds,
          createdBy: user?.id || null,
        });
        if (ok) createdCount++;
      }

      return { regenerated: true, deletedCount: regenerableIds.length, createdCount, reassignedCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['contract-plan-activities'] });
      // Nota das OSs pendentes reatribuídas ao novo responsável (Task 6).
      const reassignedNote = result?.reassignedCount
        ? ` ${result.reassignedCount} ordem(ns) de serviço pendente(s) reatribuída(s).`
        : '';
      if (result?.regenerated) {
        toast({
          title: 'Contrato atualizado!',
          description: `${result.createdCount} visita(s) futura(s) recalculada(s). Realizadas e em andamento preservadas.${reassignedNote}`,
        });
      } else if (reassignedNote) {
        toast({ title: 'Contrato atualizado!', description: reassignedNote.trim() });
      } else {
        toast({ title: 'Contrato atualizado!' });
      }
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro ao atualizar contrato', description: getErrorMessage(e) }),
  });

  /**
   * Atualiza SÓ o conjunto de equipamentos/itens do contrato (aba Equipamentos
   * da tela de detalhe). Reusa exatamente o mesmo caminho de diff + regeneração
   * de visitas futuras do `updateContract`, MAS nunca dispara UPDATE na linha
   * `contracts` (não há campo de contrato pra mudar aqui) — evita um update
   * vazio/ruim. Idempotente: salvar a MESMA lista não muda nada e não recria
   * visitas.
   *
   * Regra de regeneração (idêntica ao updateContract):
   *  - só quando o CONJUNTO de equipamentos muda (insere/remove item);
   *  - DELETA+recria apenas OSs 'agendada'/'pendente' com scheduled_date >= hoje;
   *  - PRESERVA intactas: passadas e qualquer OS não-regenerável (concluída,
   *    em_andamento, a_caminho, pausada, cancelada);
   *  - re-expande o checklist por equipamento pelo novo conjunto;
   *  - contrato inativo → só aplica o diff, sem gerar visitas.
   */
  const updateContractEquipment = useMutation({
    mutationFn: async (input: {
      id: string;
      items: { equipment_id?: string | null; item_name: string; item_description?: string | null; form_template_id?: string | null }[];
    }) => {
      const { id, items } = input;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id || '')
        .single();
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      // Contrato atual — base pra reidratar as OSs novas (sem tocar na linha).
      const { data: current, error: curErr } = await supabase
        .from('contracts')
        .select('start_date, frequency_type, frequency_value, horizon_months, status, customer_id, name, technician_id, team_id, service_type_id, form_template_id')
        .eq('id', id)
        .single();
      if (curErr) throw curErr;

      // 1) Diff de contract_items (mesma chave estável do updateContract:
      //    equipment_id || nome do item manual). Idempotente.
      const { data: existingItems } = await supabase
        .from('contract_items')
        .select('id, equipment_id, item_name')
        .eq('contract_id', id);
      const itemKey = (it: { equipment_id?: string | null; item_name: string }) =>
        it.equipment_id ? `eq:${it.equipment_id}` : `manual:${(it.item_name || '').trim().toLowerCase()}`;

      const existingByKey = new Map<string, { id: string }>();
      for (const it of (existingItems ?? []) as { id: string; equipment_id: string | null; item_name: string }[]) {
        existingByKey.set(itemKey(it), { id: it.id });
      }
      const newKeys = new Set(items.map(itemKey));

      const toInsert = items.filter(it => !existingByKey.has(itemKey(it)));
      const toRemoveIds = (existingItems ?? [])
        .filter((it: any) => !newKeys.has(itemKey(it)))
        .map((it: any) => it.id) as string[];

      let itemsChanged = false;
      if (toRemoveIds.length > 0) {
        await supabase.from('contract_items').delete().in('id', toRemoveIds);
        itemsChanged = true;
      }
      if (toInsert.length > 0) {
        const baseSort = (existingItems ?? []).length;
        const { error: insErr } = await supabase.from('contract_items').insert(
          toInsert.map((item, i) => ({
            contract_id: id,
            equipment_id: item.equipment_id || null,
            item_name: item.item_name,
            item_description: item.item_description || null,
            form_template_id: item.form_template_id || null,
            sort_order: baseSort + i,
          })) as any
        );
        if (insErr) throw insErr;
        itemsChanged = true;
      }

      // Nada mudou OU contrato inativo → para por aqui (sem regerar, sem UPDATE).
      if (!itemsChanged || current.status !== 'active') {
        return { regenerated: false, deletedCount: 0, createdCount: 0 };
      }

      // 2) Regenerar visitas futuras não-tocadas (mesma regra do updateContract).
      const todayStr = todayStrSaoPaulo();

      const { data: contractOss } = await supabase
        .from('service_orders')
        .select('id, scheduled_date, status')
        .eq('contract_id', id);

      const regenerableIds = (contractOss || [])
        .filter(o =>
          REGENERABLE_OS_STATUSES.has(o.status ?? '') &&
          (o.scheduled_date ?? '') >= todayStr
        )
        .map(o => o.id)
        .filter(Boolean) as string[];

      if (regenerableIds.length > 0) {
        await supabase.from('service_order_assignees').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_order_equipment').delete().in('service_order_id', regenerableIds);
        await supabase.from('form_responses').delete().in('service_order_id', regenerableIds);
        await supabase.from('os_photos').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_ratings').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_order_activities').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_orders').delete().in('id', regenerableIds);
      }

      // Plano persistido atual (não muda na aba de equipamentos).
      const { data: persisted } = await supabase
        .from('contract_plan_activities')
        .select('id, description, guidance, section, component, freq_code, freq_months, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, applies_per_equipment')
        .eq('contract_id', id)
        .order('sort_order', { ascending: true });
      const effPlan: PlanActivityInput[] = (persisted ?? []).map((a: any) => ({
        description: a.description,
        guidance: a.guidance,
        section: a.section,
        component: a.component,
        freq_code: a.freq_code,
        freq_months: a.freq_months,
        is_measurement: a.is_measurement,
        unit: a.unit,
        expected_min: a.expected_min,
        expected_max: a.expected_max,
        contract_item_id: a.contract_item_id,
        catalog_activity_id: a.catalog_activity_id,
        applies_per_equipment: a.applies_per_equipment,
      }));
      const effPlanIds: (string | null)[] = (persisted ?? []).map((a: any) => a.id);

      const useGroupedEngine = effPlan.length > 0;
      const visits = buildContractVisits(
        {
          startDate: new Date(current.start_date + 'T12:00:00'),
          frequencyType: current.frequency_type as 'days' | 'months',
          frequencyValue: current.frequency_value as number,
          horizonMonths: current.horizon_months as number,
          planActivities: effPlan,
          planActivityIds: effPlanIds,
        },
        todayStr,
      );

      // Lê os itens DEPOIS do diff → reflete o novo conjunto de equipamentos.
      const { data: contractItemsRows } = await supabase
        .from('contract_items')
        .select('id, equipment_id')
        .eq('contract_id', id);
      const equipmentIds = (contractItemsRows ?? [])
        .map((i: any) => i.equipment_id)
        .filter(Boolean) as string[];
      const itemEquipmentMap: Record<string, string | null> = {};
      for (const it of (contractItemsRows ?? []) as { id: string; equipment_id: string | null }[]) {
        itemEquipmentMap[it.id] = it.equipment_id ?? null;
      }

      const effTechnicianId = (current.technician_id as string | null) ?? null;
      const effTeamId = (current.team_id as string | null) ?? null;
      const assigneeUserIds = effTechnicianId ? [effTechnicianId] : [];
      const effName = (current.name as string | null) || 'Contrato';

      let createdCount = 0;
      for (let i = 0; i < visits.length; i++) {
        const ok = await persistContractVisit({
          companyId: profile.company_id,
          contractId: id,
          visit: visits[i],
          visitIndex: i,
          contractName: effName,
          useGroupedEngine,
          customerId: current.customer_id as string,
          technicianId: effTechnicianId,
          teamId: effTeamId,
          serviceTypeId: (current.service_type_id as string | null) ?? null,
          formTemplateId: (current.form_template_id as string | null) ?? null,
          equipmentIds,
          itemEquipmentMap,
          assigneeUserIds,
          createdBy: user?.id || null,
        });
        if (ok) createdCount++;
      }

      return { regenerated: true, deletedCount: regenerableIds.length, createdCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['contract-plan-activities'] });
      if (result?.regenerated) {
        toast({
          title: 'Equipamentos atualizados!',
          description: `${result.createdCount} visita(s) futura(s) recalculada(s). Realizadas e em andamento preservadas.`,
        });
      } else {
        toast({ title: 'Equipamentos atualizados!' });
      }
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro ao atualizar equipamentos', description: getErrorMessage(e) }),
  });

  /**
   * Atualiza os AMBIENTES (e seus equipamentos) de um contrato PMOC pela aba
   * "Ambientes" da tela de detalhe. Espelha o updateContractEquipment, mas:
   *  - recebe `environments` (cada um com seus equipment_ids) ALÉM dos `items`;
   *  - aplica o diff de contract_items (insere novos, apaga removidos);
   *  - sincroniza contract_environments (insere/atualiza/remove) e religa
   *    environment_id dos itens;
   *  - regenera as visitas futuras SÓ quando o CONJUNTO de equipamentos muda
   *    (mover equipamento entre ambientes não muda o cronograma);
   *  - nunca dispara UPDATE na linha `contracts` (sem update vazio).
   * Idempotente: salvar a mesma configuração não recria visitas.
   */
  const updateContractEnvironments = useMutation({
    mutationFn: async (input: {
      id: string;
      items: { equipment_id?: string | null; item_name: string; item_description?: string | null; form_template_id?: string | null }[];
      environments: ContractEnvironmentInput[];
    }) => {
      const { id, items, environments } = input;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id || '')
        .single();
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const { data: current, error: curErr } = await supabase
        .from('contracts')
        .select('start_date, frequency_type, frequency_value, horizon_months, status, customer_id, name, technician_id, team_id, service_type_id, form_template_id')
        .eq('id', id)
        .single();
      if (curErr) throw curErr;

      // 1) Diff de contract_items (mesma chave estável: equipment_id || nome manual).
      const { data: existingItems } = await supabase
        .from('contract_items')
        .select('id, equipment_id, item_name')
        .eq('contract_id', id);
      const itemKey = (it: { equipment_id?: string | null; item_name: string }) =>
        it.equipment_id ? `eq:${it.equipment_id}` : `manual:${(it.item_name || '').trim().toLowerCase()}`;
      const existingByKey = new Map<string, { id: string }>();
      for (const it of (existingItems ?? []) as { id: string; equipment_id: string | null; item_name: string }[]) {
        existingByKey.set(itemKey(it), { id: it.id });
      }
      const newKeys = new Set(items.map(itemKey));
      const toInsert = items.filter(it => !existingByKey.has(itemKey(it)));
      const toRemoveIds = (existingItems ?? [])
        .filter((it: any) => !newKeys.has(itemKey(it)))
        .map((it: any) => it.id) as string[];

      let itemsChanged = false;
      if (toRemoveIds.length > 0) {
        await supabase.from('contract_items').delete().in('id', toRemoveIds);
        itemsChanged = true;
      }
      if (toInsert.length > 0) {
        const baseSort = (existingItems ?? []).length;
        const { error: insErr } = await supabase.from('contract_items').insert(
          toInsert.map((item, i) => ({
            contract_id: id,
            equipment_id: item.equipment_id || null,
            item_name: item.item_name,
            item_description: item.item_description || null,
            form_template_id: item.form_template_id || null,
            sort_order: baseSort + i,
          })) as any
        );
        if (insErr) throw insErr;
        itemsChanged = true;
      }

      // 2) Sincroniza ambientes + religa environment_id dos itens (após o diff).
      await syncContractEnvironments({ companyId: profile.company_id, contractId: id, environments });

      // Conjunto de equipamentos não mudou OU contrato inativo → não regerar.
      if (!itemsChanged || current.status !== 'active') {
        return { regenerated: false, deletedCount: 0, createdCount: 0 };
      }

      // 3) Regenerar visitas futuras (mesma regra do updateContractEquipment).
      const todayStr = todayStrSaoPaulo();
      const { data: contractOss } = await supabase
        .from('service_orders')
        .select('id, scheduled_date, status')
        .eq('contract_id', id);
      const regenerableIds = (contractOss || [])
        .filter(o => REGENERABLE_OS_STATUSES.has(o.status ?? '') && (o.scheduled_date ?? '') >= todayStr)
        .map(o => o.id)
        .filter(Boolean) as string[];
      if (regenerableIds.length > 0) {
        await supabase.from('service_order_assignees').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_order_equipment').delete().in('service_order_id', regenerableIds);
        await supabase.from('form_responses').delete().in('service_order_id', regenerableIds);
        await supabase.from('os_photos').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_ratings').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_order_activities').delete().in('service_order_id', regenerableIds);
        await supabase.from('service_orders').delete().in('id', regenerableIds);
      }

      const { data: persisted } = await supabase
        .from('contract_plan_activities')
        .select('id, description, guidance, section, component, freq_code, freq_months, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, applies_per_equipment')
        .eq('contract_id', id)
        .order('sort_order', { ascending: true });
      const effPlan: PlanActivityInput[] = (persisted ?? []).map((a: any) => ({
        description: a.description, guidance: a.guidance, section: a.section, component: a.component,
        freq_code: a.freq_code, freq_months: a.freq_months, is_measurement: a.is_measurement,
        unit: a.unit, expected_min: a.expected_min, expected_max: a.expected_max,
        contract_item_id: a.contract_item_id, catalog_activity_id: a.catalog_activity_id,
        applies_per_equipment: a.applies_per_equipment,
      }));
      const effPlanIds: (string | null)[] = (persisted ?? []).map((a: any) => a.id);
      const useGroupedEngine = effPlan.length > 0;
      const visits = buildContractVisits(
        {
          startDate: new Date(current.start_date + 'T12:00:00'),
          frequencyType: current.frequency_type as 'days' | 'months',
          frequencyValue: current.frequency_value as number,
          horizonMonths: current.horizon_months as number,
          planActivities: effPlan,
          planActivityIds: effPlanIds,
        },
        todayStr,
      );

      const { data: contractItemsRows } = await supabase
        .from('contract_items')
        .select('id, equipment_id')
        .eq('contract_id', id);
      const equipmentIds = (contractItemsRows ?? []).map((i: any) => i.equipment_id).filter(Boolean) as string[];
      const itemEquipmentMap: Record<string, string | null> = {};
      for (const it of (contractItemsRows ?? []) as { id: string; equipment_id: string | null }[]) {
        itemEquipmentMap[it.id] = it.equipment_id ?? null;
      }
      const effTechnicianId = (current.technician_id as string | null) ?? null;
      const effTeamId = (current.team_id as string | null) ?? null;
      const assigneeUserIds = effTechnicianId ? [effTechnicianId] : [];
      const effName = (current.name as string | null) || 'Contrato';

      let createdCount = 0;
      for (let i = 0; i < visits.length; i++) {
        const ok = await persistContractVisit({
          companyId: profile.company_id,
          contractId: id,
          visit: visits[i],
          visitIndex: i,
          contractName: effName,
          useGroupedEngine,
          customerId: current.customer_id as string,
          technicianId: effTechnicianId,
          teamId: effTeamId,
          serviceTypeId: (current.service_type_id as string | null) ?? null,
          formTemplateId: (current.form_template_id as string | null) ?? null,
          equipmentIds,
          itemEquipmentMap,
          assigneeUserIds,
          createdBy: user?.id || null,
        });
        if (ok) createdCount++;
      }

      return { regenerated: true, deletedCount: regenerableIds.length, createdCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['contract-plan-activities'] });
      if (result?.regenerated) {
        toast({
          title: 'Ambientes atualizados!',
          description: `${result.createdCount} visita(s) futura(s) recalculada(s). Realizadas e em andamento preservadas.`,
        });
      } else {
        toast({ title: 'Ambientes atualizados!' });
      }
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro ao atualizar ambientes', description: getErrorMessage(e) }),
  });

  /**
   * Renovação assistida (estender no lugar). Aumenta o horizonte do MESMO
   * contrato em `extraMonths` (default 12) e gera APENAS o tail novo de visitas
   * — as datas estritamente DEPOIS da última visita existente. Não recria nem
   * duplica as visitas já geradas.
   *
   * Idempotência: como o corte é sempre "> última visita existente", rodar 2x
   * SEM novo extraMonths não cria nada na 2ª vez (a última visita passa a ser a
   * nova final, e o horizonte estendido não avança mais).
   *
   * Só atua em contrato ATIVO. Inativo: não estende e não gera (relata).
   *
   * Reusa o motor único (buildContractVisits + persistContractVisit), com a
   * mesma montagem de equipamentos/plano/assignees do updateContract.
   */
  const renewContract = useMutation({
    mutationFn: async (input: { id: string; extraMonths?: number }): Promise<{ addedCount: number; newUntil: string | null; skipped?: 'inactive' }> => {
      const { id } = input;
      const extraMonths = input.extraMonths ?? 12;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id || '')
        .single();
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      // Contrato atual — base de geração (mesmos campos que o updateContract lê).
      const { data: current, error: curErr } = await supabase
        .from('contracts')
        .select('start_date, frequency_type, frequency_value, horizon_months, status, customer_id, name, technician_id, team_id, service_type_id, form_template_id')
        .eq('id', id)
        .single();
      if (curErr) throw curErr;

      // Renovação só faz sentido em contrato ativo. Inativo → não estende nem gera.
      if (current.status !== 'active') {
        return { addedCount: 0, newUntil: null, skipped: 'inactive' };
      }

      const newHorizon = (current.horizon_months as number) + extraMonths;

      // Estende o horizonte do contrato.
      const { error: updErr } = await supabase
        .from('contracts')
        .update({ horizon_months: newHorizon } as any)
        .eq('id', id);
      if (updErr) throw updErr;

      // Maior scheduled_date entre as OSs do contrato = última visita existente.
      // O corte do tail é ESTRITAMENTE depois dela (idempotência).
      const { data: contractOss } = await supabase
        .from('service_orders')
        .select('scheduled_date')
        .eq('contract_id', id);
      const lastScheduled = (contractOss || [])
        .map(o => o.scheduled_date as string | null)
        .filter((d): d is string => !!d)
        .sort()
        .pop() ?? null;

      // Plano persistido do contrato (mesma forma do updateContractEquipment).
      const { data: persisted } = await supabase
        .from('contract_plan_activities')
        .select('id, description, guidance, section, component, freq_code, freq_months, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, applies_per_equipment')
        .eq('contract_id', id)
        .order('sort_order', { ascending: true });
      const effPlan: PlanActivityInput[] = (persisted ?? []).map((a: any) => ({
        description: a.description,
        guidance: a.guidance,
        section: a.section,
        component: a.component,
        freq_code: a.freq_code,
        freq_months: a.freq_months,
        is_measurement: a.is_measurement,
        unit: a.unit,
        expected_min: a.expected_min,
        expected_max: a.expected_max,
        contract_item_id: a.contract_item_id,
        catalog_activity_id: a.catalog_activity_id,
        applies_per_equipment: a.applies_per_equipment,
      }));
      const effPlanIds: (string | null)[] = (persisted ?? []).map((a: any) => a.id);
      const useGroupedEngine = effPlan.length > 0;

      // Constrói a série completa no NOVO horizonte e corta pra só o tail novo:
      // visitas com data ESTRITAMENTE depois da última existente. Sem última
      // visita (contrato sem OS), gera tudo a partir do start (corte só pelo
      // horizonte). `fromMonthStr` filtra por >=, então usamos o dia seguinte à
      // última visita pra ficar estritamente maior.
      const fromStr = lastScheduled
        ? (() => {
            const next = addDays(new Date(lastScheduled + 'T12:00:00'), 1);
            const y = next.getFullYear();
            const m = String(next.getMonth() + 1).padStart(2, '0');
            const d = String(next.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
          })()
        : undefined;

      const visits = buildContractVisits(
        {
          startDate: new Date((current.start_date as string) + 'T12:00:00'),
          frequencyType: current.frequency_type as 'days' | 'months',
          frequencyValue: current.frequency_value as number,
          horizonMonths: newHorizon,
          planActivities: effPlan,
          planActivityIds: effPlanIds,
        },
        fromStr,
      );

      // Equipamentos / mapa item→equipamento do contrato.
      const { data: contractItemsRows } = await supabase
        .from('contract_items')
        .select('id, equipment_id')
        .eq('contract_id', id);
      const equipmentIds = (contractItemsRows ?? [])
        .map((i: any) => i.equipment_id)
        .filter(Boolean) as string[];
      const itemEquipmentMap: Record<string, string | null> = {};
      for (const it of (contractItemsRows ?? []) as { id: string; equipment_id: string | null }[]) {
        itemEquipmentMap[it.id] = it.equipment_id ?? null;
      }

      // Índice base pra numerar as novas visitas em sequência às existentes.
      const baseIndex = (contractOss || []).length;

      const effTechnicianId = (current.technician_id as string | null) ?? null;
      const effTeamId = (current.team_id as string | null) ?? null;
      const assigneeUserIds = effTechnicianId ? [effTechnicianId] : [];
      const effName = (current.name as string | null) || 'Contrato';

      let addedCount = 0;
      for (let i = 0; i < visits.length; i++) {
        const ok = await persistContractVisit({
          companyId: profile.company_id,
          contractId: id,
          visit: visits[i],
          visitIndex: baseIndex + i,
          contractName: effName,
          useGroupedEngine,
          customerId: current.customer_id as string,
          technicianId: effTechnicianId,
          teamId: effTeamId,
          serviceTypeId: (current.service_type_id as string | null) ?? null,
          formTemplateId: (current.form_template_id as string | null) ?? null,
          equipmentIds,
          itemEquipmentMap,
          assigneeUserIds,
          createdBy: user?.id || null,
        });
        if (ok) addedCount++;
      }

      // Data final do contrato após a renovação (maior data entre as novas).
      let newUntil: string | null = lastScheduled;
      for (const v of visits) {
        const y = v.date.getFullYear();
        const m = String(v.date.getMonth() + 1).padStart(2, '0');
        const d = String(v.date.getDate()).padStart(2, '0');
        const s = `${y}-${m}-${d}`;
        if (!newUntil || s > newUntil) newUntil = s;
      }

      return { addedCount, newUntil };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['contract-plan-activities'] });
      if (result?.skipped === 'inactive') {
        toast({ variant: 'destructive', title: 'Contrato inativo', description: 'Reative o contrato antes de renovar.' });
        return;
      }
      if ((result?.addedCount ?? 0) === 0) {
        toast({ title: 'Nada a gerar', description: 'O contrato já está estendido até a última visita.' });
        return;
      }
      const untilLabel = result?.newUntil
        ? new Date(result.newUntil + 'T12:00:00').toLocaleDateString('pt-BR')
        : '';
      toast({
        title: 'Contrato renovado!',
        description: `${result?.addedCount} nova(s) visita(s) geradas${untilLabel ? ` até ${untilLabel}` : ''}.`,
      });
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro ao renovar contrato', description: getErrorMessage(e) }),
  });

  /**
   * Libera/oculta os documentos PMOC no portal público do cliente final
   * (2026-06). Atualiza só `contracts.portal_documents_released` no próprio
   * contrato (RLS multi-tenant garante que o gestor só altera contrato da sua
   * company). Invalida a query do detalhe pra o botão refletir o novo estado.
   */
  const setPortalDocumentsReleased = useMutation({
    mutationFn: async ({ contractId, released }: { contractId: string; released: boolean }) => {
      const { error } = await supabase
        .from('contracts')
        .update({ portal_documents_released: released } as any)
        .eq('id', contractId);
      if (error) throw error;
      return { contractId, released };
    },
    onSuccess: ({ contractId, released }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contract-detail', contractId] });
      queryClient.invalidateQueries({ queryKey: ['pmoc-portal'] });
      toast({
        title: released ? 'Documentos liberados no portal' : 'Documentos ocultados do portal',
      });
    },
    onError: (e: Error) =>
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar liberação dos documentos',
        description: getErrorMessage(e),
      }),
  });

  const executeDeleteContract = async (id: string): Promise<{ deletedOsCount: number; unlinkedOsCount: number; preservedTxCount: number; deletedTxCount: number }> => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Fonte única: service_orders do contrato (a tabela-sombra de ocorrências
    // foi aposentada). Futuras (scheduled_date >= hoje) são apagadas; passadas
    // são desvinculadas pra continuarem no histórico como OS avulsas.
    const { data: contractOss } = await supabase
      .from('service_orders')
      .select('id, scheduled_date')
      .eq('contract_id', id);

    const futureOsIds = (contractOss || [])
      .filter(o => (o.scheduled_date ?? '') >= todayStr)
      .map(o => o.id)
      .filter(Boolean) as string[];

    const pastOsIds = (contractOss || [])
      .filter(o => (o.scheduled_date ?? '') < todayStr)
      .map(o => o.id)
      .filter(Boolean) as string[];

    const deletedOsCount = futureOsIds.length;
    const unlinkedOsCount = pastOsIds.length;

    // Transações financeiras do contrato: ESPELHA o tratamento das OS.
    // Receita realizada (is_paid=true) NUNCA pode ser destruída por exclusão de
    // contrato — os relatórios de faturamento contam por is_paid+transaction_date,
    // não por contract_id. Então preservamos as pagas DESVINCULANDO (contract_id=null)
    // e apagamos só as cobranças não realizadas (em aberto / agendadas).
    // is_paid=NULL é tratado como NÃO realizado (cobrança futura) → apagável.
    const { data: contractTxs } = await supabase
      .from('financial_transactions')
      .select('id, is_paid')
      .eq('contract_id', id);

    const paidTxIds = (contractTxs || [])
      .filter(t => t.is_paid === true)
      .map(t => t.id)
      .filter(Boolean) as string[];

    const unpaidTxIds = (contractTxs || [])
      .filter(t => t.is_paid !== true)
      .map(t => t.id)
      .filter(Boolean) as string[];

    const preservedTxCount = paidTxIds.length;
    const deletedTxCount = unpaidTxIds.length;

    // Preserva (desvincula) recebimentos já realizados → ficam no caixa como avulsos
    if (paidTxIds.length > 0) {
      await supabase.from('financial_transactions').update({ contract_id: null } as any).in('id', paidTxIds);
    }
    // Apaga só as cobranças não realizadas
    if (unpaidTxIds.length > 0) {
      await supabase.from('financial_transactions').delete().in('id', unpaidTxIds);
    }

    // Delete related records
    await supabase.from('contract_items').delete().eq('contract_id', id);
    // Ambientes climatizados do contrato (multi-ambiente PMOC).
    await supabase.from('contract_environments').delete().eq('contract_id', id);

    // Delete future linked service orders (and their junction rows)
    if (futureOsIds.length > 0) {
      await supabase.from('service_order_assignees').delete().in('service_order_id', futureOsIds);
      await supabase.from('service_order_equipment').delete().in('service_order_id', futureOsIds);
      await supabase.from('form_responses').delete().in('service_order_id', futureOsIds);
      await supabase.from('os_photos').delete().in('service_order_id', futureOsIds);
      await supabase.from('service_ratings').delete().in('service_order_id', futureOsIds);
      await supabase.from('service_orders').delete().in('id', futureOsIds);
    }

    // Unlink past OS from this contract so they remain as standalone records
    if (pastOsIds.length > 0) {
      await supabase.from('service_orders').update({ contract_id: null } as any).in('id', pastOsIds);
    }

    const { error } = await supabase.from('contracts').delete().eq('id', id);
    if (error) throw error;

    return { deletedOsCount, unlinkedOsCount, preservedTxCount, deletedTxCount };
  };

  const deleteContractMutation = useMutation({
    mutationFn: async (id: string) => {
      return await executeDeleteContract(id);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['financial'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      const { deletedOsCount, unlinkedOsCount, preservedTxCount, deletedTxCount } = result || { deletedOsCount: 0, unlinkedOsCount: 0, preservedTxCount: 0, deletedTxCount: 0 };
      const parts: string[] = [];
      if (deletedOsCount > 0) {
        parts.push(`${deletedOsCount} OS${deletedOsCount > 1 ? 's futuras apagadas' : ' futura apagada'}`);
      }
      if (unlinkedOsCount > 0) {
        parts.push(`${unlinkedOsCount} OS${unlinkedOsCount > 1 ? 's passadas mantidas no histórico' : ' passada mantida no histórico'}`);
      }
      if (preservedTxCount > 0) {
        parts.push(`${preservedTxCount} recebimento${preservedTxCount > 1 ? 's' : ''} já realizado${preservedTxCount > 1 ? 's' : ''} preservado${preservedTxCount > 1 ? 's' : ''} no caixa`);
      }
      if (deletedTxCount > 0) {
        parts.push(`${deletedTxCount} cobrança${deletedTxCount > 1 ? 's' : ''} em aberto removida${deletedTxCount > 1 ? 's' : ''}`);
      }
      toast({
        title: 'Contrato excluído com sucesso!',
        description: parts.length > 0 ? parts.join(' · ') : 'Sem OSs vinculadas.',
      });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir contrato', description: getErrorMessage(e) });
    },
  });

  const deleteContract = {
    mutate: (id: string) => deleteContractMutation.mutate(id),
    mutateAsync: (id: string) => deleteContractMutation.mutateAsync(id),
  };

  const visibleContracts = contracts;

  // Stats
  const now = new Date();
  const activeContracts = visibleContracts.filter(c => c.status === 'active');
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Stats derivadas 100% de service_orders do contrato (fonte única).
  const osGeneratedThisMonth = visibleContracts.flatMap(c => c.service_orders || []).filter(os => {
    if (!os.scheduled_date) return false;
    const d = new Date(os.scheduled_date + 'T12:00:00');
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;

  const sevenDaysFromNow = addDays(now, 7);
  const upcomingOccurrences = visibleContracts.flatMap(c => c.service_orders || []).filter(os => {
    if (!isActiveContractOS(os) || !os.scheduled_date) return false;
    const d = new Date(os.scheduled_date + 'T12:00:00');
    return d >= now && d <= sevenDaysFromNow;
  }).length;

  const thirtyDaysFromNow = addDays(now, 30);
  const expiringContracts = activeContracts.filter(c => {
    // "Vencendo" = última OS do contrato (maior scheduled_date) cai dentro de 30 dias.
    const lastOs = (c.service_orders || [])
      .filter(os => !!os.scheduled_date)
      .sort((a, b) => new Date(b.scheduled_date!).getTime() - new Date(a.scheduled_date!).getTime())[0];
    if (!lastOs?.scheduled_date) return false;
    const lastDate = new Date(lastOs.scheduled_date + 'T12:00:00');
    return lastDate <= thirtyDaysFromNow;
  }).length;

  return {
    contracts: visibleContracts,
    isLoading,
    createContract,
    updateContract,
    updateContractEquipment,
    updateContractEnvironments,
    updateContractStatus,
    applyFinancialLinksToContractParcels,
    renewContract,
    setPortalDocumentsReleased,
    deleteContract,
    stats: {
      active: activeContracts.length,
      osGeneratedThisMonth,
      upcomingOccurrences,
      expiringContracts,
    },
  };
}
