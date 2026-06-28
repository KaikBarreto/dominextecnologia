import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { useAuth } from '@/contexts/AuthContext';
import { addDays, addMonths } from 'date-fns';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import {
  scheduleActivitiesOntoVisits,
  type ActivitySpec,
  type VisitInput,
} from '@/components/contracts/visitScheduleEngine';

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
  // Contrato comum: VÁRIOS checklists por equipamento (jsonb array de template
  // ids). Fonte da verdade quando não-vazio; senão cai pro `form_template_id`
  // único (backward-compat). Vazio/ausente = comportamento antigo de 1 checklist.
  form_template_ids?: string[] | null;
  // Contrato comum: ids de perguntas (form_questions) que NÃO entram na 1ª OS
  // deste equipamento. Vazio/ausente = todas entram. (Opção A — fatia 2.)
  first_os_excluded_questions?: string[] | null;
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
  /** URL pública (bucket equipment-files) da foto do ambiente. */
  photo_url?: string | null;
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
  // Checklist personalizado (Fase 2). Quando setado, a atividade NÃO vem da norma
  // PMOC: é um form_templates da empresa, feito em toda visita ALÉM do catálogo.
  // Carrega-se intocada até o snapshot (service_order_activities.form_template_id);
  // o render das perguntas do template fica pra Fase 3 (dev-os-campo).
  form_template_id?: string | null;
  // Escopo da atividade (Fase 3 — checklist por equipamento). `true` (default) =
  // a atividade se aplica a CADA equipamento do contrato (ex.: limpar filtro de
  // cada split). `false` = atividade de LOCAL (ex.: casa de máquinas, dutos) →
  // 1 linha sem equipamento. Atividade com `contract_item_id` específico
  // sempre resolve pro equipamento daquele item (ignora este flag).
  applies_per_equipment?: boolean;
  // Referência client-side ao equipamento dono da atividade (Fase 3 — plano POR
  // MÁQUINA). Na CRIAÇÃO os `contract_items` só ganham id após o insert, então a
  // UI manda o `equipment_id` aqui e o hook resolve `contract_item_id` quando os
  // itens existirem (mapa equipment_id → contract_item_id). Atividade de LOCAL
  // (sem máquina) deixa `equipment_ref` vazio + `applies_per_equipment=false`.
  equipment_ref?: string | null;
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

// ──────────────────────────────────────────────────────────────────────────
// MOTOR DE VISITAS POR MÁQUINA (Fase 2 — PMOC por equipamento)
// ──────────────────────────────────────────────────────────────────────────
// Conceito do ciclo de 12 visitas (mensal), níveis acumulativos por POSIÇÃO:
//   Mensal (M): toda posição (1..12)
//   Trimestral (T): posições 3, 6, 9, 12 (pos % 3 == 0)
//   Semestral (S): posições 6, 12 (pos % 6 == 0)
//   Anual (A): posição 12
// "Começar na visita N" = a 1ª visita da máquina cai na posição N; as seguintes
// seguem N+1, N+2… (módulo 12). A fase fica em contract_items.pmoc_start_visit.

/** Escopo da norma por máquina. 'ac' = só condicionadores; 'full' = toda a norma. */
export type PmocScope = 'ac' | 'full';

/**
 * Seções da norma consideradas de CONDICIONADOR (escopo 'ac'). Máquinas 'ac' só
 * recebem atividades dessas seções (+ medições/testes, que são por equipamento).
 * Máquinas 'full' recebem todas as seções aplicáveis. Constante no código, não
 * no banco (mapeamento seção→escopo do plano). Atividade sem `section` é tratada
 * como aplicável a ambos os escopos (não filtra).
 */
export const PMOC_AC_SECTIONS = new Set<string>([
  'condicionadores',
  'medicoes',
  'testes',
]);

/**
 * Posição (1..12) de uma máquina no mês de índice k (0-based), dada a fase
 * inicial `startVisit` (1/3/6/12). pos = ((startVisit - 1 + k) % 12) + 1.
 * Função pura e testável.
 */
export function positionForMonth(startVisit: number, monthIndex: number): number {
  const sv = Number.isFinite(startVisit) && startVisit >= 1 ? startVisit : 12;
  return (((sv - 1 + monthIndex) % 12) + 12) % 12 + 1;
}

/**
 * Níveis de frequência DEVIDOS numa posição do ciclo (1..12). M sempre; T se
 * pos%3==0; S se pos%6==0; A se pos==12. Função PURA — base testável do motor.
 */
export function dueLevelsForPosition(pos: number): Set<FreqCode> {
  const levels = new Set<FreqCode>(['M']);
  if (pos % 3 === 0) levels.add('T');
  if (pos % 6 === 0) levels.add('S');
  if (pos === 12) levels.add('A');
  return levels;
}

/**
 * Decide se uma atividade (pela frequência) é devida no mês `monthIndex` para uma
 * máquina cuja fase é `startVisit`. Atividade sem freq_code (genérica/freq_months)
 * cai no comportamento modular global antigo (período divide o mês) pra não
 * quebrar contratos não-PMOC com frequência livre. Função PURA.
 */
export function isActivityDueForMachine(
  a: Pick<PlanActivityInput, 'freq_code' | 'freq_months'>,
  startVisit: number,
  monthIndex: number,
): boolean {
  if (a.freq_code && a.freq_code !== 'E') {
    const pos = positionForMonth(startVisit, monthIndex);
    return dueLevelsForPosition(pos).has(a.freq_code);
  }
  // Sem código de norma (eventual ou freq_months livre): cai no modular global.
  return isActivityDueAtMonth(a, monthIndex);
}

/** Máquina do contrato pro motor (1 contract_item com escopo + fase). */
export interface MachineInput {
  /** id do contract_item (chave dona das atividades via contract_item_id). */
  contractItemId: string;
  /** equipamento do item (pode ser null pra item manual). */
  equipmentId: string | null;
  pmocScope: PmocScope;
  pmocStartVisit: number;
}

/**
 * Atividade do plano pro motor por máquina. `contractItemId` = máquina dona
 * (null = nível contrato: local ou legado). `planActivityId` = linha persistida
 * pra snapshot. `appliesPerEquipment` distingue local (false) de legado por-eq
 * (true) quando `contractItemId` é null.
 */
export interface MachinePlanActivity {
  input: PlanActivityInput;
  planActivityId: string | null;
  contractItemId: string | null;
  appliesPerEquipment: boolean;
}

/**
 * Emissão resolvida de uma atividade numa visita: já sabe o equipamento alvo e
 * o "bucket" de ordenação (full primeiro, depois ac, depois local). É o que o
 * persist grava como 1 linha de service_order_activities.
 */
export interface ResolvedEmission {
  input: PlanActivityInput;
  planActivityId: string | null;
  equipmentId: string | null;
  /** Bucket de ordenação: 0=full, 1=ac, 2=local. Menor sai primeiro. */
  bucket: number;
  /** Índice estável da máquina dentro do bucket (mantém máquinas agrupadas). */
  machineRank: number;
  /** Ordem da atividade dentro da máquina (sort_order do plano). */
  activitySort: number;
}

/** Visita já resolvida por máquina: data + emissões prontas pro snapshot. */
export interface ResolvedVisit {
  date: Date;
  emissions: ResolvedEmission[];
}

/**
 * MOTOR POR MÁQUINA (Fase 2). Determinístico e PURO. Para cada mês k (0..horizonte)
 * e cada máquina, calcula a posição no ciclo (com a fase da máquina) e seleciona
 * as atividades devidas, resolvendo o equipamento alvo. Três fontes de atividade:
 *
 *  1) Atividade com `contractItemId` = X → pertence à máquina X; usa a fase e o
 *     escopo de X; emite com o equipamento de X.
 *  2) LOCAL (`contractItemId null` + `appliesPerEquipment=false`): só quando há
 *     ≥1 máquina 'full'; fase âncora = menor pmoc_start_visit entre as 'full';
 *     emite com equipment_id null. (bucket local)
 *  3) LEGADO (`contractItemId null` + `appliesPerEquipment=true`): expande pra
 *     TODAS as máquinas, cada uma com a sua fase/escopo. Mantém back-compat dos
 *     contratos antigos (plano sem contract_item_id).
 *
 * Filtro por escopo: máquina 'ac' só recebe atividades cuja `section` ∈
 * PMOC_AC_SECTIONS (ou sem section); 'full' recebe tudo. Aplica-se aos casos 1 e 3.
 *
 * Agrupamento: 1 visita (OS) por MÊS; mês sem nenhuma emissão NÃO vira visita.
 * Ordem dentro da visita: 'full' primeiro, depois 'ac', depois local.
 */
export function buildPerMachineVisits(
  startDate: Date,
  horizonMonths: number,
  machines: MachineInput[],
  activities: MachinePlanActivity[],
): ResolvedVisit[] {
  // Rank estável de máquina por bucket (full antes de ac), pra agrupar a saída.
  const bucketOf = (m: MachineInput): number => (m.pmocScope === 'full' ? 0 : 1);
  const machinesSorted = machines
    .map((m, originalIdx) => ({ m, originalIdx }))
    .sort((a, b) => bucketOf(a.m) - bucketOf(b.m) || a.originalIdx - b.originalIdx);
  const machineRank = new Map<string, number>();
  machinesSorted.forEach(({ m }, rank) => machineRank.set(m.contractItemId, rank));

  // Atividades indexadas por máquina dona (contractItemId).
  const byMachine = new Map<string, MachinePlanActivity[]>();
  const localActs: MachinePlanActivity[] = []; // contractItemId null + per_eq=false
  const legacyActs: MachinePlanActivity[] = []; // contractItemId null + per_eq=true
  activities.forEach((act) => {
    if (act.contractItemId) {
      const arr = byMachine.get(act.contractItemId) ?? [];
      arr.push(act);
      byMachine.set(act.contractItemId, arr);
    } else if (act.appliesPerEquipment === false) {
      localActs.push(act);
    } else {
      legacyActs.push(act);
    }
  });

  // Âncora de fase dos locais = menor pmoc_start_visit entre as máquinas 'full'.
  const fullMachines = machines.filter(m => m.pmocScope === 'full');
  const hasFull = fullMachines.length > 0;
  const localAnchorStart = hasFull
    ? Math.min(...fullMachines.map(m => m.pmocStartVisit))
    : 12;

  // Escopo: máquina 'ac' só pega seções de condicionador (ou sem section).
  // Checklist PERSONALIZADO (section 'personalizados') vale pra QUALQUER escopo —
  // é aditivo do gestor, não faz parte da norma, então nunca é filtrado por ac/full.
  const scopeAllows = (scope: PmocScope, section: string | null | undefined): boolean => {
    if (section === 'personalizados') return true;
    if (scope === 'full') return true;
    if (!section) return true;
    return PMOC_AC_SECTIONS.has(section);
  };

  const visits: ResolvedVisit[] = [];

  for (let k = 0; k <= horizonMonths && visits.length < 120; k++) {
    const emissions: ResolvedEmission[] = [];

    for (const m of machines) {
      const bucket = bucketOf(m);
      const rank = machineRank.get(m.contractItemId) ?? 0;

      // Caso 1: atividades próprias da máquina.
      const own = byMachine.get(m.contractItemId) ?? [];
      own.forEach((act, actSort) => {
        if (!scopeAllows(m.pmocScope, act.input.section)) return;
        if (!isActivityDueForMachine(act.input, m.pmocStartVisit, k)) return;
        emissions.push({
          input: act.input,
          planActivityId: act.planActivityId,
          equipmentId: m.equipmentId,
          bucket,
          machineRank: rank,
          activitySort: actSort,
        });
      });

      // Caso 3: legado (sem contract_item_id, per_eq=true) → expande pra cada máquina.
      // PRESERVAÇÃO: atividade legada NÃO sofre filtro de escopo (escopo é
      // conceito do novo formato, Fase 3). Sem isso, um contrato antigo 'ac' com
      // atividade de seção não-AC (ex.: dutos) perderia a atividade — divergindo
      // do motor modular global anterior. Legado expande pra TODAS as máquinas.
      legacyActs.forEach((act, actSort) => {
        if (!isActivityDueForMachine(act.input, m.pmocStartVisit, k)) return;
        emissions.push({
          input: act.input,
          planActivityId: act.planActivityId,
          equipmentId: m.equipmentId,
          bucket,
          machineRank: rank,
          activitySort: actSort,
        });
      });
    }

    // Caso 2: locais — só com ≥1 máquina 'full'; fase âncora; equipamento null.
    if (hasFull) {
      localActs.forEach((act, actSort) => {
        if (!isActivityDueForMachine(act.input, localAnchorStart, k)) return;
        emissions.push({
          input: act.input,
          planActivityId: act.planActivityId,
          equipmentId: null,
          bucket: 2, // local sempre por último
          machineRank: machines.length, // depois de todas as máquinas
          activitySort: actSort,
        });
      });
    }

    if (emissions.length === 0) continue;
    visits.push({ date: addMonths(startDate, k), emissions });
  }

  return visits;
}

/**
 * Cadência MENSAL = o default histórico do PMOC (1 visita por mês). Só essa
 * cadência usa o caminho `buildPerMachineVisits` (ciclo-12 + addMonths), que é
 * byte-a-byte o comportamento legado. Qualquer outra cadência (a cada 14 dias,
 * bimestral, …) roteia pro caminho custom (`buildPerMachineVisitsCustom`), que
 * gera as datas reais e encaixa as atividades pelo motor compartilhado.
 *
 * Função PURA — backward-compat do PMOC mensal depende dela retornar `true`
 * exatamente quando o contrato é "months / 1".
 */
export function isMonthlyCadence(
  frequencyType: 'days' | 'months',
  frequencyValue: number,
): boolean {
  return frequencyType === 'months' && frequencyValue === 1;
}

/**
 * MOTOR POR MÁQUINA — CADÊNCIA CUSTOM (≠ mensal). Espelha `buildPerMachineVisits`
 * (mesma saída `ResolvedVisit[]`, mesmos buckets/ordenação por máquina), MAS:
 *
 *  • As DATAS das visitas vêm da cadência real (`visitDates`, já geradas por
 *    `generateOccurrences(start, freq_type, freq_value, horizon)`), não de
 *    `addMonths` mensal. O ciclo-12/positionForMonth NÃO se aplica (é mensal).
 *  • Quais atividades vencem em cada visita é decidido pelo motor COMPARTILHADO
 *    `scheduleActivitiesOntoVisits` (visitScheduleEngine), por máquina:
 *      - Catálogo da norma (sem form_template_id, freq_code M/T/S/A): vira
 *        ActivitySpec por TEMPO (M=1, T=3, S=6, A=12 meses; E/eventual = não
 *        agenda), startKind 'contract_start' → a 1ª ocorrência cai na 1ª visita
 *        com data ≥ a meta (encaixa na visita mais próxima depois de vencer).
 *      - Checklist personalizado (form_template_id, section 'personalizados'):
 *        é o CONTAINER, vai em TODA visita (freqKind 'visits', freqVisits 1) —
 *        as PERGUNTAS dele filtram por frequência no RENDER (v1.15.19/20). Não
 *        sofre filtro de escopo ac/full.
 *
 * Snapshot idêntico ao mensal: cada emissão devida vira 1 linha; mês/visita sem
 * nenhuma emissão NÃO vira visita (segue o modelo de snapshot do PMOC). O persist
 * é o mesmo (`persistContractVisit` via `emissions`).
 *
 * Determinístico/puro: só usa as datas recebidas. Não gera datas, não usa
 * Date.now(). É o trilho "comum" (cadência configurável + frequência por
 * atividade resolvida sobre as datas reais) aplicado ao PMOC.
 */
export function buildPerMachineVisitsCustom(
  visitDates: Date[],
  machines: MachineInput[],
  activities: MachinePlanActivity[],
): ResolvedVisit[] {
  if (visitDates.length === 0) return [];

  // Rank estável de máquina por bucket (full antes de ac) — idêntico ao mensal.
  const bucketOf = (m: MachineInput): number => (m.pmocScope === 'full' ? 0 : 1);
  const machinesSorted = machines
    .map((m, originalIdx) => ({ m, originalIdx }))
    .sort((a, b) => bucketOf(a.m) - bucketOf(b.m) || a.originalIdx - b.originalIdx);
  const machineRank = new Map<string, number>();
  machinesSorted.forEach(({ m }, rank) => machineRank.set(m.contractItemId, rank));

  // Particiona como no mensal: próprias da máquina, locais, legado.
  const byMachine = new Map<string, MachinePlanActivity[]>();
  const localActs: MachinePlanActivity[] = []; // contractItemId null + per_eq=false
  const legacyActs: MachinePlanActivity[] = []; // contractItemId null + per_eq=true
  activities.forEach((act) => {
    if (act.contractItemId) {
      const arr = byMachine.get(act.contractItemId) ?? [];
      arr.push(act);
      byMachine.set(act.contractItemId, arr);
    } else if (act.appliesPerEquipment === false) {
      localActs.push(act);
    } else {
      legacyActs.push(act);
    }
  });

  const hasFull = machines.some((m) => m.pmocScope === 'full');

  // Escopo: igual ao mensal — 'ac' só pega seções de condicionador (ou sem
  // section); 'personalizados' vale pra qualquer escopo (aditivo do gestor).
  const scopeAllows = (scope: PmocScope, section: string | null | undefined): boolean => {
    if (section === 'personalizados') return true;
    if (scope === 'full') return true;
    if (!section) return true;
    return PMOC_AC_SECTIONS.has(section);
  };

  // Uma atividade do plano → ActivitySpec do motor compartilhado.
  //  • Checklist personalizado (form_template_id): container em TODA visita.
  //  • Catálogo: por TEMPO em meses (freq_code → meses; eventual = null → ignora).
  const toSpec = (act: MachinePlanActivity, specId: string): ActivitySpec | null => {
    if (act.input.form_template_id) {
      return { id: specId, freqKind: 'visits', freqVisits: 1, startKind: 'due_now' };
    }
    const months = activityPeriodMonths(act.input);
    if (months <= 0) return null; // eventual / sem período → não agenda
    return { id: specId, freqKind: 'time', freqMonths: months, startKind: 'contract_start' };
  };

  const visitInputs: VisitInput[] = visitDates.map((d) => ({ date: d }));
  // Acumula as emissões por índice de visita; só visitas com emissão viram OS.
  const perVisit = new Map<number, ResolvedEmission[]>();
  const pushEmission = (visitIdx: number, e: ResolvedEmission) => {
    const arr = perVisit.get(visitIdx);
    if (arr) arr.push(e);
    else perVisit.set(visitIdx, [e]);
  };

  // Agenda as atividades de UM conjunto (máquina ou local) sobre as visitas e
  // empurra as emissões resolvidas. `specToAct` mapeia o id sintético de volta
  // pra a atividade + sua ordem (activitySort) dentro do conjunto.
  const scheduleSet = (
    acts: MachinePlanActivity[],
    emit: (act: MachinePlanActivity, actSort: number, visitIdx: number) => void,
  ) => {
    const specs: ActivitySpec[] = [];
    const specMeta: Record<string, { act: MachinePlanActivity; actSort: number }> = {};
    acts.forEach((act, actSort) => {
      const id = `a${actSort}`;
      const spec = toSpec(act, id);
      if (!spec) return;
      specs.push(spec);
      specMeta[id] = { act, actSort };
    });
    if (specs.length === 0) return;
    const map = scheduleActivitiesOntoVisits(visitInputs, specs);
    for (const [visitIdx, ids] of map) {
      for (const id of ids) {
        const meta = specMeta[id];
        if (!meta) continue;
        emit(meta.act, meta.actSort, visitIdx);
      }
    }
  };

  for (const m of machines) {
    const bucket = bucketOf(m);
    const rank = machineRank.get(m.contractItemId) ?? 0;

    // Caso 1: atividades próprias da máquina (filtradas por escopo).
    const own = (byMachine.get(m.contractItemId) ?? []).filter((act) =>
      scopeAllows(m.pmocScope, act.input.section),
    );
    scheduleSet(own, (act, actSort, visitIdx) => {
      pushEmission(visitIdx, {
        input: act.input,
        planActivityId: act.planActivityId,
        equipmentId: m.equipmentId,
        bucket,
        machineRank: rank,
        activitySort: actSort,
      });
    });

    // Caso 3: legado (sem contract_item_id, per_eq=true) → expande pra cada
    // máquina, SEM filtro de escopo (preservação idêntica ao mensal).
    scheduleSet(legacyActs, (act, actSort, visitIdx) => {
      pushEmission(visitIdx, {
        input: act.input,
        planActivityId: act.planActivityId,
        equipmentId: m.equipmentId,
        bucket,
        machineRank: rank,
        activitySort: actSort,
      });
    });
  }

  // Caso 2: locais — só com ≥1 máquina 'full'; equipamento null; bucket por último.
  if (hasFull) {
    scheduleSet(localActs, (act, actSort, visitIdx) => {
      pushEmission(visitIdx, {
        input: act.input,
        planActivityId: act.planActivityId,
        equipmentId: null,
        bucket: 2,
        machineRank: machines.length,
        activitySort: actSort,
      });
    });
  }

  // Só visitas com emissão viram OS; ordenadas pela data real.
  const visits: ResolvedVisit[] = [];
  for (let i = 0; i < visitDates.length && visits.length < 120; i++) {
    const emissions = perVisit.get(i);
    if (!emissions || emissions.length === 0) continue;
    visits.push({ date: visitDates[i], emissions });
  }
  return visits;
}

/**
 * Linha de contract_items (forma mínima) pra montar as máquinas do motor por
 * máquina. Escopo/fase têm default no banco ('ac' / 12), mas tratamos null aqui
 * por robustez (contratos antigos antes do backfill, drift).
 */
export interface ContractItemMachineRow {
  id: string;
  equipment_id: string | null;
  pmoc_scope?: string | null;
  pmoc_start_visit?: number | null;
  sort_order?: number | null;
  // Checklists do item (M5). `form_template_ids` é a fonte da verdade quando
  // não-vazio; senão cai pro `form_template_id` (single, compat). Opcionais
  // porque nem todo SELECT que monta esta linha pede as colunas (ex.: rotas que
  // só montam máquinas e não geram service_order_equipment).
  form_template_id?: string | null;
  form_template_ids?: unknown;
}

/**
 * Lista de checklists EFETIVOS de um equipamento (M5 — múltiplos checklists por
 * equipamento). Regra do contrato de dados:
 *   - `form_template_ids` (jsonb array) quando tiver ao menos 1 id → fonte da verdade;
 *   - senão `[form_template_id]` quando o single estiver setado;
 *   - senão `[]` (equipamento sem checklist próprio).
 * Sempre dedupa preservando a ordem. Aceita `unknown` no array pra tolerar o
 * jsonb cru vindo do banco (filtra não-strings).
 */
export function effectiveItemTemplateIds(
  formTemplateIds: unknown,
  formTemplateId: string | null | undefined,
): string[] {
  const fromArray = Array.isArray(formTemplateIds)
    ? (formTemplateIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const base = fromArray.length > 0 ? fromArray : formTemplateId ? [formTemplateId] : [];
  return Array.from(new Set(base));
}

/**
 * Converte linhas de contract_items em MachineInput[] pro motor por máquina,
 * preservando a ordem por sort_order (= ordem dos equipamentos, que o motor usa
 * pra agrupar a saída). Escopo inválido cai em 'ac'; fase inválida cai em 12 —
 * exatamente os defaults do banco, garantindo PRESERVAÇÃO do comportamento atual.
 */
export function machinesFromItemRows(rows: ContractItemMachineRow[]): MachineInput[] {
  return [...rows]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((it) => ({
      contractItemId: it.id,
      equipmentId: it.equipment_id ?? null,
      pmocScope: (it.pmoc_scope === 'full' ? 'full' : 'ac') as PmocScope,
      pmocStartVisit:
        Number.isFinite(it.pmoc_start_visit) && (it.pmoc_start_visit as number) >= 1
          ? (it.pmoc_start_visit as number)
          : 12,
    }));
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
  form_template_id: string | null;
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
        .select('id, description, guidance, freq_code, freq_months, section, component, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, form_template_id, applies_per_equipment, sort_order')
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

/**
 * Decide se as visitas futuras de um contrato devem ser regeneradas ao salvar.
 *
 * Regra (pura, testável):
 *  - Contrato INATIVO → NUNCA regenera (`false`). Só vira visita quando ativo.
 *  - Contrato ATIVO regenera quando:
 *      (1) o cronograma MUDOU (datas/frequência/horizonte, plano ou conjunto de
 *          equipamentos) — comportamento clássico; OU
 *      (2) AUTO-HEAL: o contrato está ATIVO mas SEM nenhuma visita futura
 *          (`hasFutureVisits === false`), mesmo sem mudança. Isso cura um
 *          contrato que ficou em 0 ocorrências (ex.: uma limpeza apagou as OSs)
 *          no próximo "salvar" pela tela, e cobre a REATIVAÇÃO (inativo→ativo,
 *          que costuma chegar sem visita futura).
 *  - ⚠️ Não-regressão: contrato ATIVO SAUDÁVEL (tem visita futura) + SEM mudança
 *    → `false` (no-op). Evita recriar OSs à toa e resetar reatribuições.
 */
export function shouldRegenerateVisits(args: {
  newStatus: string;
  scheduleChanged: boolean;
  hasFutureVisits: boolean;
}): boolean {
  if (args.newStatus !== 'active') return false;
  return args.scheduleChanged || !args.hasFutureVisits;
}

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
  /**
   * Máquinas do contrato (contract_items com escopo + fase). Quando informado E
   * há plano, ativa o MOTOR POR MÁQUINA (Fase 2): cada máquina segue a sua fase
   * (pmoc_start_visit) e o seu escopo (pmoc_scope), e a visita carrega emissões
   * JÁ resolvidas por equipamento. Quando ausente (undefined), cai no motor
   * modular global legado (idêntico ao anterior) — não quebra contratos não-PMOC.
   */
  machines?: MachineInput[];
}

export interface BuiltVisit {
  date: Date;
  activities: { input: PlanActivityInput; planActivityId: string | null; sortOrder: number }[];
  /**
   * Emissões JÁ resolvidas por equipamento (motor por máquina, Fase 2). Quando
   * presente, `persistContractVisit` grava 1 linha por emissão (equipamento e
   * ordenação já decididos pelo motor) e ignora a expansão legada. Ausente =
   * caminho legado (expande no persist via equipmentIds/applies_per_equipment).
   */
  emissions?: ResolvedEmission[];
}

/**
 * Motor compartilhado de geração de visitas. Bifurca em 3 caminhos:
 *  1) `machines` informado + há plano → MOTOR POR MÁQUINA (Fase 2): cada máquina
 *     com sua fase/escopo; a visita já vem com emissões resolvidas por equipamento.
 *  2) há plano, sem `machines` → motor agrupado modular global (legado): 1 OS/mês.
 *  3) sem plano → cadência única legado (generateOccurrences).
 * Atividades sem período de cronograma (eventuais) não geram visita.
 *
 * `fromMonthStr` (opcional, YYYY-MM-DD) corta a série pra só datas >= esse dia —
 * usado na edição pra recriar apenas visitas futuras sem mexer no passado.
 */
export function buildContractVisits(params: BuildVisitsParams, fromMonthStr?: string): BuiltVisit[] {
  const { startDate, frequencyType, frequencyValue, horizonMonths, planActivities, planActivityIds, machines } = params;
  const validActivities = planActivities.filter(a => a.description?.trim());
  const useGrouped = validActivities.length > 0;

  const cut = (visits: BuiltVisit[]): BuiltVisit[] => {
    if (!fromMonthStr) return visits;
    return visits.filter(v => {
      const y = v.date.getFullYear();
      const m = String(v.date.getMonth() + 1).padStart(2, '0');
      const d = String(v.date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}` >= fromMonthStr;
    });
  };

  // Caminho 1 — motor por máquina (Fase 2). Só quando há máquinas E plano.
  if (machines && machines.length > 0 && useGrouped) {
    const machineActs: MachinePlanActivity[] = validActivities.map((a, idx) => ({
      input: a,
      planActivityId: planActivityIds[idx] ?? null,
      contractItemId: a.contract_item_id ?? null,
      appliesPerEquipment: a.applies_per_equipment !== false,
    }));

    // Roteamento de cadência (P1b): MENSAL = caminho legado intocado (ciclo-12 +
    // addMonths). CUSTOM (≠ mensal) = datas reais da cadência (generateOccurrences)
    // + motor compartilhado encaixando as atividades na visita mais próxima.
    // Backward-compat: PMOC mensal existente segue byte-a-byte o `buildPerMachineVisits`.
    const resolved = isMonthlyCadence(frequencyType, frequencyValue)
      ? buildPerMachineVisits(startDate, horizonMonths, machines, machineActs)
      : buildPerMachineVisitsCustom(
          generateOccurrences(startDate, frequencyType, frequencyValue, horizonMonths),
          machines,
          machineActs,
        );
    const visits: BuiltVisit[] = resolved.map((rv) => ({
      date: rv.date,
      emissions: rv.emissions,
      // `activities` derivado das emissões só pra prévia/contagem; o persist usa
      // `emissions`. Mantém o shape sem duplicar a lógica de equipamento.
      activities: rv.emissions.map((e, sortOrder) => ({
        input: e.input,
        planActivityId: e.planActivityId,
        sortOrder,
      })),
    }));
    return cut(visits);
  }

  // Caminho 2 — motor agrupado modular global (legado).
  const schedulable = validActivities
    .map((a, idx) => ({ a, planActivityId: planActivityIds[idx] ?? null }))
    .filter(({ a }) => activityPeriodMonths(a) > 0);

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
    // Caminho 3 — cadência única (frequência do contrato), sem snapshot.
    const dates = generateOccurrences(startDate, frequencyType, frequencyValue, horizonMonths);
    visits = dates.map(date => ({ date, activities: [] }));
  }

  return cut(visits);
}

/**
 * Chave de identidade de uma atividade do plano pra dedup. Duas linhas com a
 * MESMA máquina (contract_item_id), MESMA descrição, MESMA frequência, MESMA
 * seção e MESMO escopo são a MESMA atividade — saves repetidos não devem
 * acumular cópias. Função PURA/testável.
 */
function planActivityDedupKey(a: PlanActivityInput): string {
  return [
    a.contract_item_id ?? '',
    (a.description ?? '').trim().toLowerCase(),
    a.freq_code ?? '',
    a.freq_months ?? '',
    a.section ?? '',
    a.applies_per_equipment === false ? '0' : '1',
    // form_template_id entra na chave pra um checklist personalizado NÃO colidir
    // com uma atividade do catálogo de mesma descrição, e pra 2 templates
    // diferentes na mesma máquina não serem deduplicados.
    a.form_template_id ?? '',
  ].join('|');
}

/**
 * Remove atividades duplicadas do plano preservando a ordem da 1ª ocorrência.
 * Idempotente: aplicar 2x dá o mesmo resultado. Garante que o plano persistido
 * (e portanto as visitas geradas) nunca acumule a mesma atividade da mesma
 * máquina em saves repetidos. Função PURA — base testável da dedup.
 */
export function dedupPlanActivities(activities: PlanActivityInput[]): PlanActivityInput[] {
  const seen = new Set<string>();
  const out: PlanActivityInput[] = [];
  for (const a of activities) {
    const key = planActivityDedupKey(a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * Insere `service_order_activities` em LOTES pra não estourar o payload (OS PMOC
 * grande passa de mil linhas). Retorna o 1º erro encontrado (ou null). Mantém a
 * ordem (sort_order já vem nas linhas). Idempotência fica a cargo do chamador
 * (cada visita é recriada inteira, não há merge parcial).
 */
async function insertActivitiesBatched(rows: any[], batchSize = 500): Promise<any | null> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('service_order_activities').insert(chunk as any);
    if (error) return error;
  }
  return null;
}

/**
 * Executa `tasks` com concorrência LIMITADA (default 4 em paralelo). Cada visita
 * de contrato é independente (cria sua própria OS + filhos), então persistir
 * várias ao mesmo tempo encurta MUITO a regeneração (antes era 1 round-trip
 * sequencial por visita × inserts internos). O limite evita estourar a conexão.
 * Preserva a corretude: nenhuma tarefa depende do resultado de outra.
 */
async function runWithConcurrency<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<boolean>,
  concurrency = 4,
): Promise<number> {
  let okCount = 0;
  let cursor = 0;
  const runNext = async (): Promise<void> => {
    const i = cursor++;
    if (i >= items.length) return;
    const ok = await worker(items[i], i);
    if (ok) okCount++;
    await runNext();
  };
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(runners);
  return okCount;
}

/**
 * Falha alta quando nem todas as visitas calculadas viraram OS. Como
 * `persistContractVisit` engole erros (retorna false e só loga no console), sem
 * essa checagem um contrato poderia ser "salvo" com 0 ou parciais visitas e o
 * usuário receber toast de sucesso. Aqui propagamos um erro PT-BR que o
 * `onError` do mutation transforma em toast destrutivo.
 */
function assertAllVisitsPersisted(createdCount: number, expected: number): void {
  if (createdCount >= expected) return;
  const faltam = expected - createdCount;
  throw new Error(
    `Falha ao gerar as visitas do contrato: ${createdCount} de ${expected} criada(s) ` +
      `(${faltam} não foram salvas). Tente salvar novamente; se persistir, contate o suporte.`,
  );
}

/**
 * Persiste UMA visita do contrato: service_order (status agendada, origin
 * contract) + junction de equipamentos + assignees + snapshot de atividades.
 * Compartilhado entre criação e regeneração na edição — fonte única do payload
 * da OS pra criação e edição não divergirem. Todo INSERT carrega company_id
 * (RLS multi-tenant bloqueia em silêncio sem ele).
 *
 * Retorna `{ id, scheduledDate }` da OS criada em sucesso, ou `null` em falha
 * (engole o erro e loga). O id+data permite ao chamador casar a OS nova com a
 * antiga do mesmo mês pra preservar o `public_short_code` (link público).
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
  /**
   * Checklists EFETIVOS por equipamento (M5): equipment_id → [templateId, ...].
   * Quando presente e o equipamento tem ao menos 1 template, a junção
   * `service_order_equipment` emite UMA linha por (equipamento × template) —
   * o trio (service_order_id, equipment_id, form_template_id) é UNIQUE no banco.
   * Equipamento ausente do mapa (ou com lista vazia) cai no comportamento legado:
   * 1 linha com o `formTemplateId` de contrato (ou null) — preserva 1 checklist.
   */
  equipmentTemplateMap?: Record<string, string[]>;
  assigneeUserIds: string[];
  createdBy: string | null;
}): Promise<{ id: string; scheduledDate: string } | null> {
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
    return null;
  }

  if (args.equipmentIds.length > 0) {
    // M5 — UMA linha de service_order_equipment por (equipamento × checklist
    // efetivo). Quando o equipamento tem múltiplos checklists no contrato, cada
    // um vira uma linha (trio UNIQUE no banco). Sem checklists próprios → 1 linha
    // com o template de contrato (ou null): preserva exatamente o caso de 1
    // checklist. Dedup por (equipment_id, templateId) protege contra o UNIQUE.
    const seen = new Set<string>();
    const eqRows: { service_order_id: string; equipment_id: string; form_template_id: string | null }[] = [];
    for (const eqId of args.equipmentIds) {
      const effective = args.equipmentTemplateMap?.[eqId] ?? [];
      // Equipamento com checklists próprios → uma linha por template. Sem nenhum
      // → fallback ao template de contrato (ou null), comportamento legado.
      const templates: (string | null)[] = effective.length > 0 ? effective : [args.formTemplateId || null];
      for (const tpl of templates) {
        const key = `${eqId}::${tpl ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        eqRows.push({ service_order_id: os.id, equipment_id: eqId, form_template_id: tpl });
      }
    }
    if (eqRows.length > 0) {
      const { error: eqErr } = await supabase.from('service_order_equipment').insert(eqRows);
      if (eqErr) console.error('Error linking equipment:', eqErr);
    }
  }

  if (args.assigneeUserIds.length > 0) {
    const { error: assignErr } = await supabase.from('service_order_assignees').insert(
      args.assigneeUserIds.map(uid => ({ service_order_id: os.id, user_id: uid }))
    );
    if (assignErr) console.error('Error creating assignees:', assignErr);
  }

  // CAMINHO POR MÁQUINA (Fase 2). Quando a visita já vem com `emissions`
  // resolvidas, o motor por máquina JÁ decidiu o equipamento e a ordenação
  // (full → ac → local) de cada linha. Aqui só gravamos o snapshot sequencial,
  // sem re-expandir por equipamento. Cada emissão = 1 linha.
  if (visit.emissions && visit.emissions.length > 0) {
    const ordered = [...visit.emissions].sort(
      (x, y) =>
        (x.bucket - y.bucket) ||
        (x.machineRank - y.machineRank) ||
        (x.activitySort - y.activitySort),
    );
    const emissionRows = ordered.map((e, idx) => ({
      company_id: args.companyId,
      service_order_id: os.id,
      plan_activity_id: e.planActivityId,
      equipment_id: e.equipmentId,
      section: e.input.section ?? null,
      component: e.input.component ?? null,
      description: e.input.description.trim(),
      guidance: e.input.guidance ?? null,
      freq_code: e.input.freq_code ?? null,
      is_measurement: e.input.is_measurement ?? false,
      unit: e.input.unit ?? null,
      expected_min: e.input.expected_min ?? null,
      expected_max: e.input.expected_max ?? null,
      // Checklist personalizado (Fase 2): preserva o vínculo ao form_templates pra
      // a Fase 3 (dev-os-campo) renderizar as perguntas no checklist da visita.
      form_template_id: e.input.form_template_id ?? null,
      sort_order: idx,
    }));
    const actErr = await insertActivitiesBatched(emissionRows);
    if (actErr) console.error('Error creating service order activities (per-machine):', actErr);
    return { id: os.id, scheduledDate: dateStr };
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
      form_template_id: a.form_template_id ?? null,
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

    const actErr = await insertActivitiesBatched(finalRows);
    if (actErr) console.error('Error creating service order activities:', actErr);
  }

  return { id: os.id, scheduledDate: dateStr };
}

/**
 * Sincroniza os ambientes climatizados (contract_environments) de um contrato
 * com o conjunto desejado, e religa cada equipamento ao seu ambiente via
 * contract_items.environment_id. Fonte única do diff de ambientes, usada por
 * updateContract (criar usa o caminho próprio).
 *
 *  - ambiente com `id` existente → UPDATE dos campos;
 *  - ambiente sem `id` (novo) → INSERT (company_id obrigatório p/ RLS);
 *  - ambiente persistido que sumiu do conjunto → DELETE do ambiente E dos seus
 *    equipamentos (P2a): os contract_items daquele ambiente saem do contrato
 *    (em vez do antigo FK SET NULL, que deixava equipamentos órfãos no contrato
 *    e ainda nas visitas). Removidos os itens, a regeneração tira esses
 *    equipamentos das próximas visitas. OS passada/concluída é preservada pela
 *    cascata de regen (só OSs futuras agendada/pendente são refeitas);
 *  - depois, para CADA contract_item, seta environment_id pelo ambiente que
 *    reivindica seu equipment_id (um equipamento pertence a UM ambiente).
 *
 * Retorna se houve alguma mudança estrutural (insert/delete de ambiente ou de
 * item, ou religação) — sinaliza pro chamador re-expandir visitas.
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
      photo_url: env.photo_url ?? null,
      sort_order: i,
    };
    let envId = env.id && existingIds.has(env.id) ? env.id : null;
    if (envId) {
      // P3: filtra por company_id além do id (defesa em profundidade).
      await supabase.from('contract_environments').update(row as any).eq('id', envId).eq('company_id', companyId);
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

  // Ambientes que sumiram do conjunto desejado.
  const keepIds = new Set(
    environments.map(e => e.id).filter((x): x is string => !!x && existingIds.has(x)),
  );
  const toRemove = [...existingIds].filter(id => !keepIds.has(id));

  if (toRemove.length > 0) {
    // P2a: excluir um ambiente também REMOVE do contrato os equipamentos
    // (contract_items) que pertenciam a ele. Capturamos os itens ANTES de
    // apagar os ambientes (depois do DELETE do env o environment_id viraria
    // null por FK e não daria mais pra identificá-los). Apagar o item dispara a
    // cascata no plano (contract_plan_activities via FK) e a regeneração tira o
    // equipamento das próximas visitas. OS passada/concluída é preservada (a
    // regen só refaz OSs futuras agendada/pendente).
    const { data: itemsForRemoval } = await supabase
      .from('contract_items')
      .select('id, environment_id')
      .eq('contract_id', contractId);
    const orphanItemIds = itemsRemovedByEnvironmentRemoval(
      (itemsForRemoval ?? []) as { id: string; environment_id: string | null }[],
      toRemove,
    );
    if (orphanItemIds.length > 0) {
      // contract_items não tem company_id → escopo por contract_id (fronteira do
      // tenant via RLS do contrato).
      await supabase.from('contract_items').delete().in('id', orphanItemIds).eq('contract_id', contractId);
      changed = true;
    }
    // contract_environments TEM company_id → defesa em profundidade (P3).
    await supabase.from('contract_environments').delete().in('id', toRemove).eq('company_id', companyId);
    changed = true;
  }

  // Religa cada contract_item ao ambiente do seu equipamento. Só faz UPDATE
  // quando o vínculo realmente muda (idempotente). Lê DEPOIS da remoção acima
  // pra não reprocessar itens já excluídos.
  const { data: itemRows } = await supabase
    .from('contract_items')
    .select('id, equipment_id, environment_id')
    .eq('contract_id', contractId);
  for (const it of (itemRows ?? []) as { id: string; equipment_id: string | null; environment_id: string | null }[]) {
    const desired = it.equipment_id ? (equipmentToEnv[it.equipment_id] ?? null) : null;
    if ((it.environment_id ?? null) !== desired) {
      // P3: filtra por contract_id além do id (contract_items não tem
      // company_id; contract_id é a fronteira do tenant via RLS).
      await supabase.from('contract_items').update({ environment_id: desired } as any).eq('id', it.id).eq('contract_id', contractId);
      changed = true;
    }
  }

  return changed;
}

/**
 * P2a (pura/testável): dado o conjunto de contract_items (cada um com seu
 * `environment_id`) e os ids dos ambientes REMOVIDOS, retorna os ids dos itens
 * que saem do contrato — exatamente os equipamentos daqueles ambientes. Excluir
 * um ambiente também remove seus equipamentos (em vez de deixá-los órfãos via FK
 * SET NULL). Item sem ambiente (environment_id null) nunca é afetado.
 */
export function itemsRemovedByEnvironmentRemoval(
  items: { id: string; environment_id: string | null }[],
  removedEnvIds: string[],
): string[] {
  const removed = new Set(removedEnvIds);
  return items
    .filter((it) => it.environment_id != null && removed.has(it.environment_id))
    .map((it) => it.id);
}

/**
 * Mês (YYYY-MM) de uma data no formato YYYY-MM-DD. Tolerante a null/'' (retorna
 * null). Usa só o prefixo da string — não constrói Date (evita shift de TZ).
 */
function monthKeyFromDateStr(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // 'YYYY-MM-DD' → 'YYYY-MM'. Aceita também 'YYYY-MM-DDThh:mm' por segurança.
  const m = /^(\d{4})-(\d{2})/.exec(dateStr);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** OS antiga (a apagar) com o código público a preservar. */
export interface OldOsForPreserve {
  scheduled_date: string | null;
  public_short_code: string | null;
}

/** OS nova (recém-criada) que pode herdar um código antigo. */
export interface NewOsForPreserve {
  id: string;
  scheduled_date: string | null;
}

/** Par a aplicar: a OS NOVA `id` deve receber o `public_short_code` antigo. */
export interface CodeReuseAssignment {
  newId: string;
  code: string;
}

/**
 * 🔗 PRESERVAÇÃO DE LINK PÚBLICO POR MÊS (pura/testável).
 *
 * Como há 1 OS por mês por contrato, casamos o `public_short_code` das OSs
 * ANTIGAS (que serão apagadas) com as OSs NOVAS pelo mês (YYYY-MM da
 * scheduled_date). Assim o link amigável já compartilhado (`/os-tecnico/<slug>-
 * <codigo>`) sobrevive à edição do contrato: o código migra pra OS nova do
 * mesmo mês e o `get_public_os_by_code` resolve pra ela.
 *
 * Regras:
 *  - mês casa (antigo + novo) → reusa o código antigo na OS nova;
 *  - mês NOVO sem antigo (horizonte aumentou) → mantém o código do trigger
 *    (não entra no resultado);
 *  - mês ANTIGO sem novo (visita saiu do cronograma) → código descartado (o
 *    link daquele mês morre — aceitável, a visita mudou);
 *  - sem duplicação: cada código antigo é reusado no máximo 1×; se 2 OSs novas
 *    caírem no mesmo mês (não deveria — 1 OS/mês), só a 1ª herda;
 *  - idempotente: aplicar 2× dá o mesmo conjunto de pares.
 *
 * ⚠️ O caller só deve aplicar estes UPDATEs DEPOIS de apagar as OSs antigas —
 * `public_short_code` é UNIQUE GLOBAL e o código está "em uso" pela antiga até
 * o delete.
 */
export function preserveCodesByMonth(
  oldOss: OldOsForPreserve[],
  newOss: NewOsForPreserve[],
): CodeReuseAssignment[] {
  // Mapa mês → código antigo (1 código por mês; 1ª ocorrência ganha, ignora
  // antigos sem código). Vários antigos no mesmo mês não deveriam existir.
  const codeByMonth = new Map<string, string>();
  for (const o of oldOss) {
    const key = monthKeyFromDateStr(o.scheduled_date);
    if (!key) continue;
    const code = o.public_short_code;
    if (!code) continue;
    if (!codeByMonth.has(key)) codeByMonth.set(key, code);
  }

  const out: CodeReuseAssignment[] = [];
  const usedCode = new Set<string>(); // não aplicar o mesmo código a 2 OSs
  const claimedMonth = new Set<string>(); // 1 OS nova por mês herda
  for (const n of newOss) {
    const key = monthKeyFromDateStr(n.scheduled_date);
    if (!key || claimedMonth.has(key)) continue;
    const code = codeByMonth.get(key);
    if (!code || usedCode.has(code)) continue;
    out.push({ newId: n.id, code });
    usedCode.add(code);
    claimedMonth.add(key);
  }
  return out;
}

/**
 * Cascata de exclusão de OSs regeneráveis de um contrato (dependentes → OS).
 * Fonte ÚNICA da sequência de limpeza — usada pela regeneração (após gerar as
 * novas, P0) e pela exclusão de contrato. financial_transactions NÃO são
 * tocadas (billing mensal é separado). No-op pra lista vazia.
 */
async function deleteRegenerableOrders(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await supabase.from('service_order_assignees').delete().in('service_order_id', ids);
  await supabase.from('service_order_equipment').delete().in('service_order_id', ids);
  await supabase.from('form_responses').delete().in('service_order_id', ids);
  await supabase.from('os_photos').delete().in('service_order_id', ids);
  await supabase.from('service_ratings').delete().in('service_order_id', ids);
  await supabase.from('service_order_activities').delete().in('service_order_id', ids);
  await supabase.from('service_orders').delete().in('id', ids);
}

/**
 * Parâmetros da regeneração compartilhada (P0/P1). Reúne tudo que
 * `persistContractVisit` precisa, mais o conjunto de OSs antigas a apagar e as
 * visitas já calculadas. `oldRegenerableIds` é capturado pelo chamador ANTES de
 * mexer (mas NÃO apagado por ele — o apaga sai daqui, só após o sucesso).
 */
export interface RegenerateFutureVisitsArgs {
  companyId: string;
  contractId: string;
  visits: BuiltVisit[];
  /** ids das OSs futuras regeneráveis (agendada/pendente, scheduled_date >= hoje). */
  oldRegenerableIds: string[];
  /**
   * OSs futuras regeneráveis com mês + `public_short_code` — pra preservar o link
   * público por mês (migra o código pra OS nova do mesmo mês, após o delete).
   * Opcional/back-compat: sem ela, nenhum código é preservado (comportamento
   * antigo). A renovação (deleteOld=false) não precisa.
   */
  oldRegenerableOss?: OldOsForPreserve[];
  contractName: string;
  useGroupedEngine: boolean;
  customerId: string;
  technicianId: string | null;
  teamId: string | null;
  serviceTypeId: string | null;
  formTemplateId: string | null;
  equipmentIds: string[];
  itemEquipmentMap?: Record<string, string | null>;
  /** Checklists efetivos por equipamento (M5) — ver persistContractVisit. */
  equipmentTemplateMap?: Record<string, string[]>;
  assigneeUserIds: string[];
  createdBy: string | null;
  /** Índice base da numeração das visitas (default 0). renew usa baseIndex>0. */
  baseVisitIndex?: number;
  /**
   * Quando `true` (default), APAGA as `oldRegenerableIds` — só DEPOIS de gerar e
   * validar as novas. `false` = só gera o tail (renovação) sem apagar nada.
   */
  deleteOld?: boolean;
}

/**
 * ⚠️ ORQUESTRAÇÃO PURA da regeneração segura "GERAR ANTES DE APAGAR" (P0).
 *
 * Função sem I/O acoplado: recebe callbacks (`persist`, `validate`, `deleteOld`)
 * e impõe a ORDEM correta — gerar → validar → (só então) apagar. É a unidade
 * testável da invariante: numa falha de geração/validação, `deleteOld` NUNCA é
 * chamado (as OSs antigas permanecem; sem janela de perda). Em sucesso, apaga
 * por último. `shouldDeleteOld=false` (renovação) nunca apaga.
 *
 * Retorna { createdCount, deletedCount }. `persist` devolve quantas visitas
 * foram criadas; `validate(createdCount)` lança se faltou alguma.
 */
export async function orchestrateRegeneration(deps: {
  persist: () => Promise<number>;
  validate: (createdCount: number) => void;
  deleteOld: () => Promise<void>;
  shouldDeleteOld: boolean;
  oldCount: number;
  /**
   * Pós-delete OPCIONAL (preservação do `public_short_code` por mês). Roda só
   * DEPOIS do delete das antigas — porque o código é UNIQUE GLOBAL e a antiga
   * ainda o ocupa até ser apagada. Falha aqui NÃO derruba a regeneração (o link
   * antigo morre, mas as visitas novas já estão válidas) — o caller engole.
   */
  afterDelete?: () => Promise<void>;
}): Promise<{ createdCount: number; deletedCount: number }> {
  // PASSO 1 — gera/persiste as novas visitas (antes de apagar qualquer coisa).
  const createdCount = await deps.persist();
  // PASSO 2 — valida ANTES de apagar. Lança se incompleto → não chega no passo 3.
  deps.validate(createdCount);
  // PASSO 3 — só agora apaga as antigas (geração confirmada).
  if (deps.shouldDeleteOld) {
    await deps.deleteOld();
    // PASSO 4 — só após liberar os códigos antigos (delete), migra-os pras OSs
    // novas do mesmo mês (UNIQUE GLOBAL exige que a antiga não exista mais).
    if (deps.afterDelete) await deps.afterDelete();
  }
  return { createdCount, deletedCount: deps.shouldDeleteOld ? deps.oldCount : 0 };
}

/**
 * ⚠️ REGENERAÇÃO SEGURA — fonte ÚNICA (P0/P1). "GERAR ANTES DE APAGAR".
 *
 * Hoje a edição precisa trocar as OSs futuras regeneráveis pelas recalculadas.
 * A ordem importa: se apagássemos primeiro e a geração falhasse no meio, o
 * contrato ficaria SEM nenhuma visita futura. Por isso a ordem é imposta pela
 * função pura `orchestrateRegeneration`:
 *
 *   1) GERA/persiste as novas visitas (persistContractVisit em paralelo);
 *   2) VALIDA com assertAllVisitsPersisted (createdCount === visits.length) —
 *      se faltou alguma, LANÇA erro e NÃO apaga as antigas (estado preservado);
 *   3) só com sucesso, APAGA as antigas (deleteRegenerableOrders).
 *
 * Custo aceito e documentado: numa falha rara de DELETE pós-geração (passo 3),
 * podem coexistir OSs antigas + novas (duplicado VISÍVEL e corrigível pela tela)
 * — MUITO melhor que o contrato ficar com ZERO visitas. A propagação do erro do
 * passo 2 cai no `onError` da mutation (toast destrutivo PT-BR).
 *
 * Usado por updateContract, updateContractEquipment e (com deleteOld=false) pela
 * renovação — sem duplicar a ordem gerar→validar→apagar em 4 lugares.
 *
 * Retorna { createdCount, deletedCount }.
 */
export async function regenerateFutureVisits(
  args: RegenerateFutureVisitsArgs,
): Promise<{ createdCount: number; deletedCount: number }> {
  const baseIndex = args.baseVisitIndex ?? 0;
  const deleteOld = args.deleteOld ?? true;

  // Coleta as OSs NOVAS (id + data) conforme são criadas, pra casar com as
  // antigas do mesmo mês e migrar o `public_short_code` (link público).
  const newOss: NewOsForPreserve[] = [];

  return orchestrateRegeneration({
    shouldDeleteOld: deleteOld,
    oldCount: args.oldRegenerableIds.length,
    // PASSO 1 — gera/persiste as novas visitas (antes de apagar qualquer coisa).
    persist: () =>
      runWithConcurrency(args.visits, async (visit, i) => {
        const created = await persistContractVisit({
          companyId: args.companyId,
          contractId: args.contractId,
          visit,
          visitIndex: baseIndex + i,
          contractName: args.contractName,
          useGroupedEngine: args.useGroupedEngine,
          customerId: args.customerId,
          technicianId: args.technicianId,
          teamId: args.teamId,
          serviceTypeId: args.serviceTypeId,
          formTemplateId: args.formTemplateId,
          equipmentIds: args.equipmentIds,
          itemEquipmentMap: args.itemEquipmentMap,
          equipmentTemplateMap: args.equipmentTemplateMap,
          assigneeUserIds: args.assigneeUserIds,
          createdBy: args.createdBy,
        });
        if (!created) return false;
        newOss.push({ id: created.id, scheduled_date: created.scheduledDate });
        return true;
      }),
    // PASSO 2 — valida (erro não-silencioso). Se incompleto, lança e o passo 3
    // (apagar) nunca roda → as antigas permanecem.
    validate: (createdCount) => assertAllVisitsPersisted(createdCount, args.visits.length),
    // PASSO 3 — apaga as antigas só após a validação (geração confirmada).
    deleteOld: () => deleteRegenerableOrders(args.oldRegenerableIds),
    // PASSO 4 — preserva o link público por mês: migra o public_short_code das
    // OSs antigas (já apagadas → código liberado) pras novas do mesmo mês.
    afterDelete: () => reapplyPreservedCodes(args.oldRegenerableOss ?? [], newOss),
  });
}

/**
 * Aplica os pares mês→código (preserveCodesByMonth) nas OSs novas via UPDATE
 * individual de `public_short_code`. Só roda DEPOIS do delete das antigas (o
 * código é UNIQUE GLOBAL). Erros são engolidos por par (logados): no pior caso
 * o link daquele mês morre, mas a visita nova continua válida — não derruba a
 * regeneração. No-op quando não há código a reusar.
 */
async function reapplyPreservedCodes(
  oldOss: OldOsForPreserve[],
  newOss: NewOsForPreserve[],
): Promise<void> {
  const assignments = preserveCodesByMonth(oldOss, newOss);
  for (const { newId, code } of assignments) {
    const { error } = await supabase
      .from('service_orders')
      .update({ public_short_code: code } as any)
      .eq('id', newId);
    if (error) console.error('Falha ao preservar link público da visita:', newId, error);
  }
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
          contract_items (id, contract_id, equipment_id, environment_id, item_name, item_description, form_template_id, form_template_ids, first_os_excluded_questions, pmoc_scope, pmoc_start_visit, sort_order, equipment:equipment(id, name, brand, model)),
          contract_environments (id, company_id, contract_id, identificacao, tipo_atividade, area_climatizada_m2, ocupantes_fixos, ocupantes_flutuantes, carga_termica_tr, photo_url, sort_order),
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
      // Itens/equipamentos do contrato. `pmoc_scope` ('ac'|'full') e
      // `pmoc_start_visit` (1/3/6/12) são a rotina POR MÁQUINA (Fase 3): escopo da
      // norma + posição inicial no ciclo de 12 visitas. Defaults do banco quando
      // omitidos ('ac' / 12) — preserva o comportamento de "tudo na 1ª visita".
      items: { equipment_id?: string | null; item_name: string; item_description?: string | null; form_template_id?: string | null; form_template_ids?: string[]; first_os_excluded_questions?: string[]; pmoc_scope?: 'ac' | 'full'; pmoc_start_visit?: number }[];
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
              photo_url: env.photo_url ?? null,
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
      // (contract_item_id → equipment_id) usado na expansão por equipamento, e as
      // máquinas (escopo + fase) pro motor por máquina (Fase 2). `pmoc_scope` e
      // `pmoc_start_visit` (Fase 3) vêm da UI por equipamento; quando omitidos,
      // os defaults do banco ('ac' / start_visit 12) assumem.
      const itemEquipmentMap: Record<string, string | null> = {};
      // Mapa equipment_id → contract_item_id recém-criado: usado pra resolver o
      // `contract_item_id` das atividades do plano POR MÁQUINA (a UI manda o
      // equipment_id em `equipment_ref` porque os ids dos itens só nascem aqui).
      const equipmentToItemId: Record<string, string> = {};
      let createdMachines: MachineInput[] = [];
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
            // Contrato comum: LISTA de checklists do equipamento (M2). Só envia
            // quando informada (default do banco é [] quando omitido). O
            // form_template_id acima fica como primeiro/compat.
            ...(item.form_template_ids ? { form_template_ids: item.form_template_ids } : {}),
            // Contrato comum: perguntas que NÃO entram na 1ª OS deste equipamento.
            // Default do banco é [] quando omitido.
            ...(item.first_os_excluded_questions ? { first_os_excluded_questions: item.first_os_excluded_questions } : {}),
            // Rotina por máquina (Fase 3). Só envia quando informado pela UI; senão
            // deixa o default do banco assumir (não envia chave undefined).
            ...(item.pmoc_scope ? { pmoc_scope: item.pmoc_scope } : {}),
            ...(item.pmoc_start_visit ? { pmoc_start_visit: item.pmoc_start_visit } : {}),
            sort_order: i,
          })) as any
        ).select('id, equipment_id, pmoc_scope, pmoc_start_visit, sort_order');
        if (itemError) throw itemError;
        const insertedRows = (insertedItems ?? []) as ContractItemMachineRow[];
        for (const it of insertedRows) {
          itemEquipmentMap[it.id] = it.equipment_id ?? null;
          if (it.equipment_id) equipmentToItemId[it.equipment_id] = it.id;
        }
        createdMachines = machinesFromItemRows(insertedRows);
      }

      // Resolve o `contract_item_id` de uma atividade do plano por máquina:
      //  - `equipment_ref` (equipment_id) → contract_item_id recém-criado;
      //  - senão usa o `contract_item_id` explícito (raro no create);
      //  - atividade de LOCAL fica null (applies_per_equipment=false).
      const resolveContractItemId = (a: PlanActivityInput): string | null => {
        if (a.equipment_ref && equipmentToItemId[a.equipment_ref]) return equipmentToItemId[a.equipment_ref];
        return a.contract_item_id ?? null;
      };

      // Plano de serviços com frequência (Fase 1/3). Resolvemos o
      // `contract_item_id` de cada atividade (via equipment_ref → item recém-criado)
      // ANTES de persistir E de gerar visitas, pra o motor por máquina rotear as
      // atividades pro equipamento certo (senão cairiam no caminho legado/global).
      const planActivities = dedupPlanActivities(
        (input.plan_activities ?? [])
          .filter(a => a.description?.trim())
          .map(a => ({ ...a, contract_item_id: resolveContractItemId(a) })),
      );
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
              form_template_id: a.form_template_id ?? null,
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

        // Bifurcação por EXISTÊNCIA de plano, não por schedulable. Se o contrato
        // tem plano mas todas as atividades são Eventuais ('E') / sem período,
        // o motor agrupado retorna [] visitas → 0 OS, batendo com a prévia do
        // form. Contrato SEM plano → legado intacto (cadência única).
        const useGroupedEngine = planActivities.length > 0;

        // visits: cada item é uma OS a gerar, com a lista de atividades (snapshot)
        // que vencem naquela visita. Motor único (buildContractVisits): quando há
        // máquinas + plano, usa o motor POR MÁQUINA (fase/escopo por equipamento,
        // Fase 2); senão cai no agrupado/legado. No modo legado (sem plano), a
        // lista fica vazia e o comportamento é exatamente o de frequência única.
        const visits = buildContractVisits({
          startDate: startBase,
          frequencyType: input.frequency_type as 'days' | 'months',
          frequencyValue: input.frequency_value,
          horizonMonths: input.horizon_months,
          planActivities,
          planActivityIds: insertedPlanActivities.map(r => r.id),
          machines: createdMachines.length > 0 ? createdMachines : undefined,
        });

        expectedOsCount = visits.length;

        const equipmentIds = input.items
          .filter(i => i.equipment_id)
          .map(i => i.equipment_id!);

        // M5 — checklists efetivos por equipamento (form_template_ids com
        // fallback form_template_id). Direto do input.items: um equipamento com
        // vários checklists gera N linhas de service_order_equipment por OS.
        const equipmentTemplateMap: Record<string, string[]> = {};
        for (const it of input.items) {
          if (!it.equipment_id) continue;
          equipmentTemplateMap[it.equipment_id] = effectiveItemTemplateIds(
            it.form_template_ids,
            it.form_template_id,
          );
        }

        // Determine all user IDs that should be assignees
        const assigneeUserIds = input.assignee_user_ids && input.assignee_user_ids.length > 0
          ? input.assignee_user_ids
          : (input.technician_id ? [input.technician_id] : []);

        // persistContractVisit é a fonte única do payload da OS (mesma usada na
        // regeneração da edição). RLS de service_orders exige company_id no INSERT
        // (garantido lá dentro). Cada visita é independente → persiste EM PARALELO
        // (concorrência limitada) preservando o visitIndex pra numeração/ordem.
        osCreatedCount = await runWithConcurrency(visits, async (visit, i) => {
          const created = await persistContractVisit({
            companyId: profile.company_id,
            contractId: (contract as any).id,
            visit,
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
            equipmentTemplateMap,
            assigneeUserIds,
            createdBy: user?.id || null,
          });
          return created != null;
        });
        osErrorCount = visits.length - osCreatedCount;

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
      // Lock otimista (P2b — concorrência). Quando informado, é o `updated_at`
      // que o formulário CARREGOU. Antes de salvar, comparamos com o `updated_at`
      // ATUAL no banco; se divergir, alguém salvou no meio → abortamos com erro
      // amigável PT-BR. Best-effort: se não vier, não trava (compat).
      expectedUpdatedAt?: string | null;
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
      // `pmoc_scope`/`pmoc_start_visit` (Fase 3): rotina por máquina; mesmo quando
      // o item já existe, esses campos são RE-APLICADOS (UPDATE) pra refletir
      // mudança de escopo/fase sem precisar remover/recriar o equipamento.
      items?: { equipment_id?: string | null; item_name: string; item_description?: string | null; form_template_id?: string | null; form_template_ids?: string[]; first_os_excluded_questions?: string[]; pmoc_scope?: 'ac' | 'full'; pmoc_start_visit?: number }[];
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
      const { id, assignee_user_ids, plan_activities, items, environments, expectedUpdatedAt, ...rest } = input;

      // Empresa do usuário (RLS exige company_id em todo INSERT novo).
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id || '')
        .single();
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      // Contrato atual — base de comparação pra detectar mudança de cronograma.
      // `updated_at` alimenta o lock otimista (P2b).
      const { data: current, error: curErr } = await supabase
        .from('contracts')
        .select('start_date, frequency_type, frequency_value, horizon_months, status, customer_id, name, technician_id, team_id, updated_at')
        .eq('id', id)
        .single();
      if (curErr) throw curErr;

      // Lock otimista (P2b — concorrência). Se o form carregou um `updated_at` e
      // o atual no banco é diferente, outra aba/sessão salvou no meio. Abortamos
      // ANTES de qualquer escrita pra não atropelar a edição alheia. Best-effort:
      // sem `expectedUpdatedAt` (compat / chamadas internas) não trava.
      if (
        expectedUpdatedAt != null &&
        current?.updated_at != null &&
        current.updated_at !== expectedUpdatedAt
      ) {
        throw new Error(
          'Este contrato foi alterado em outra aba/sessão. Recarregue antes de salvar.',
        );
      }

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
      // Só dispara o UPDATE quando há de fato algum campo de contrato a mudar.
      // A aba Ambientes reusa este caminho passando SÓ items/plan/environments
      // (sem campo de contrato) — nesse caso `payload` fica vazio e um update({})
      // é inútil/arriscado (PostgREST/RLS). Itens+plano+visitas seguem normais.
      if (Object.keys(payload).length > 0) {
        const { error: updErr } = await supabase.from('contracts').update(payload).eq('id', id);
        if (updErr) throw updErr;
      }

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

      // O plano (contract_plan_activities) é persistido em 2.7, DEPOIS do diff de
      // itens (2.5) — assim o mapa equipment_id → contract_item_id já existe e o
      // plano POR MÁQUINA (Fase 3) consegue resolver o `contract_item_id`.
      let planChanged = false;
      let insertedPlanRows: { id: string }[] = [];
      const newPlan = (plan_activities ?? []).filter(a => a.description?.trim());

      // 2.5) Diff de equipamentos/itens do contrato (Fase 3). Só quando `items`
      //      foi informado. Compara o conjunto atual vs. o novo por uma chave
      //      estável (equipment_id || nome do item manual) e aplica:
      //        - insere itens novos (que não existiam) com escopo/fase da UI;
      //        - apaga itens removidos (com suas dependências);
      //        - RE-APLICA escopo/fase (pmoc_scope/pmoc_start_visit) nos iguais
      //          (idempotente no conjunto, mas reflete mudança de rotina por máquina).
      //      Mudança no conjunto OU na rotina por máquina conta como mudança de
      //      cronograma → as visitas futuras re-expandem pelo novo conjunto.
      //      ⚠️ Roda ANTES da persistência do plano (2.x abaixo) pra que TODOS os
      //      contract_items existam e o mapa equipment_id → contract_item_id esteja
      //      pronto na hora de gravar o plano POR MÁQUINA.
      let itemsChanged = false;
      if (items !== undefined) {
        const { data: existingItems } = await supabase
          .from('contract_items')
          .select('id, equipment_id, item_name, item_description, form_template_id, form_template_ids, first_os_excluded_questions, pmoc_scope, pmoc_start_visit')
          .eq('contract_id', id);
        // FIX B — item manual usa `manual:<nome>:<descrição>` (não só o nome).
        // Antes dois itens manuais homônimos (ex.: dois "Bebedouro") colapsavam
        // numa chave só e o diff perdia/não inseria uma cópia. A descrição entra
        // pra desambiguar. A chave é 100% derivada do conteúdo persistido
        // (item_name + item_description) — reconstruída IDÊNTICA tanto das linhas
        // do banco quanto do payload da UI — então um "save sem mudança" continua
        // no-op (sem delete+reinsert). `eq:<id>` (equipamentos/PMOC) é intocado.
        const itemKey = (it: { equipment_id?: string | null; item_name: string; item_description?: string | null }) =>
          it.equipment_id
            ? `eq:${it.equipment_id}`
            : `manual:${(it.item_name || '').trim().toLowerCase()}:${(it.item_description || '').trim().toLowerCase()}`;

        const existingByKey = new Map<string, { id: string; pmoc_scope: string | null; pmoc_start_visit: number | null; form_template_id: string | null; form_template_ids: string[]; first_os_excluded_questions: string[] }>();
        for (const it of (existingItems ?? []) as { id: string; equipment_id: string | null; item_name: string; item_description: string | null; form_template_id: string | null; form_template_ids: any; first_os_excluded_questions: any; pmoc_scope: string | null; pmoc_start_visit: number | null }[]) {
          const ex = Array.isArray(it.first_os_excluded_questions)
            ? (it.first_os_excluded_questions as any[]).filter((x) => typeof x === 'string')
            : [];
          const tplIds = Array.isArray(it.form_template_ids)
            ? (it.form_template_ids as any[]).filter((x) => typeof x === 'string')
            : [];
          existingByKey.set(itemKey(it), { id: it.id, pmoc_scope: it.pmoc_scope, pmoc_start_visit: it.pmoc_start_visit, form_template_id: it.form_template_id, form_template_ids: tplIds, first_os_excluded_questions: ex });
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
              ...(item.form_template_ids ? { form_template_ids: item.form_template_ids } : {}),
              ...(item.first_os_excluded_questions ? { first_os_excluded_questions: item.first_os_excluded_questions } : {}),
              ...(item.pmoc_scope ? { pmoc_scope: item.pmoc_scope } : {}),
              ...(item.pmoc_start_visit ? { pmoc_start_visit: item.pmoc_start_visit } : {}),
              sort_order: baseSort + i,
            })) as any
          );
          if (insErr) throw insErr;
          itemsChanged = true;
        }
        // Re-aplica escopo/fase nos itens que PERMANECERAM, quando a UI mandou
        // valores diferentes do persistido (mudança de rotina por máquina). Sem
        // diferença → não toca (evita marcar cronograma como mudado à toa).
        for (const item of items) {
          const existing = existingByKey.get(itemKey(item));
          if (!existing) continue; // já tratado no insert acima
          const wantScope = item.pmoc_scope;
          const wantStart = item.pmoc_start_visit;
          const scopeDiff = wantScope !== undefined && (existing.pmoc_scope ?? 'ac') !== wantScope;
          const startDiff = wantStart !== undefined && (existing.pmoc_start_visit ?? 12) !== wantStart;
          // Contrato comum: re-aplica checklist por equipamento (form_template_id +
          // exclusões da 1ª OS) quando a UI mandou e difere do persistido. Só age
          // quando o campo VEIO no payload (defined) — PMOC não manda esses campos
          // por item (omitidos = undefined), então nunca são tocados aqui.
          const wantTpl = item.form_template_id;
          const tplDiff = wantTpl !== undefined && (existing.form_template_id ?? null) !== (wantTpl || null);
          // Lista de checklists (M2). Só age quando veio no payload (defined) — a
          // ordem é semântica (1º = compat/primário), então compara posicional.
          const wantTplIds = item.form_template_ids;
          const tplIdsDiff =
            wantTplIds !== undefined &&
            (wantTplIds.length !== existing.form_template_ids.length ||
              wantTplIds.some((idv, i) => idv !== existing.form_template_ids[i]));
          const wantExcluded = item.first_os_excluded_questions;
          const excludedDiff =
            wantExcluded !== undefined &&
            [...wantExcluded].sort().join(',') !== [...existing.first_os_excluded_questions].sort().join(',');
          if (scopeDiff || startDiff || tplDiff || tplIdsDiff || excludedDiff) {
            const upd: any = {};
            if (scopeDiff) upd.pmoc_scope = wantScope;
            if (startDiff) upd.pmoc_start_visit = wantStart;
            if (tplDiff) upd.form_template_id = wantTpl || null;
            if (tplIdsDiff) upd.form_template_ids = wantTplIds;
            if (excludedDiff) upd.first_os_excluded_questions = wantExcluded;
            // Defesa em profundidade (P3): filtra por contract_id além do id. (A
            // tabela contract_items NÃO tem company_id — o tenant é herdado do
            // contrato via RLS; contract_id é a fronteira correta aqui.) Permite
            // detectar 0-rows e barra cruzar item de outro contrato.
            await supabase.from('contract_items').update(upd).eq('id', existing.id).eq('contract_id', id);
            itemsChanged = true;
          }
        }
      }

      // Mapa equipment_id → contract_item_id (pós-diff) pra resolver o
      // `contract_item_id` das atividades do plano POR MÁQUINA. A UI manda o
      // equipment_id em `equipment_ref`; aqui traduzimos pro id real do item.
      const equipmentToItemId: Record<string, string> = {};
      {
        const { data: curItems } = await supabase
          .from('contract_items')
          .select('id, equipment_id')
          .eq('contract_id', id);
        for (const it of (curItems ?? []) as { id: string; equipment_id: string | null }[]) {
          if (it.equipment_id) equipmentToItemId[it.equipment_id] = it.id;
        }
      }
      const resolveContractItemId = (a: PlanActivityInput): string | null => {
        if (a.equipment_ref && equipmentToItemId[a.equipment_ref]) return equipmentToItemId[a.equipment_ref];
        return a.contract_item_id ?? null;
      };

      // Plano novo JÁ com `contract_item_id` resolvido (via equipment_ref → item)
      // e SEM duplicatas. ⚠️ Fonte ÚNICA do plano daqui pra frente: usado tanto na
      // persistência (contract_plan_activities) quanto na GERAÇÃO de visitas
      // (effPlan). Antes, `newPlan` (cru, com contract_item_id null porque a UI
      // manda só equipment_ref) ia direto pro motor → toda atividade caía no
      // ramo LEGADO de buildPerMachineVisits e era expandida pra TODAS as máquinas
      // (×N equipamentos). Era a causa-raiz da explosão de service_order_activities.
      const newPlanResolved = dedupPlanActivities(
        newPlan.map(a => ({ ...a, contract_item_id: resolveContractItemId(a) })),
      );

      // 2.7) Persistir o plano editado (substituição completa). Só quando
      //      plan_activities foi informado. Eventuais ('E') ficam registrados mas
      //      não geram visita. RLS exige company_id no INSERT. Roda DEPOIS do diff
      //      de itens (2.5) pra resolver `contract_item_id` por máquina via
      //      `equipment_ref` (plano POR MÁQUINA, Fase 3).
      if (plan_activities !== undefined) {
        // Compara plano novo vs. atual (descrição + frequência + escopo + máquina)
        // pra saber se o cronograma mudou por causa do plano.
        const { data: existingPlan } = await supabase
          .from('contract_plan_activities')
          .select('description, freq_code, freq_months, applies_per_equipment, contract_item_id, form_template_id')
          .eq('contract_id', id)
          .order('sort_order', { ascending: true });
        const sigExisting = (arr: any[]) =>
          (arr || [])
            .map(a => `${(a.description || '').trim()}|${a.freq_code ?? ''}|${a.freq_months ?? ''}|${a.applies_per_equipment === false ? '0' : '1'}|${a.contract_item_id ?? ''}|${a.form_template_id ?? ''}`)
            .join('§');
        const sigNew = (arr: PlanActivityInput[]) =>
          (arr || [])
            .map(a => `${(a.description || '').trim()}|${a.freq_code ?? ''}|${a.freq_months ?? ''}|${a.applies_per_equipment === false ? '0' : '1'}|${a.contract_item_id ?? ''}|${a.form_template_id ?? ''}`)
            .join('§');
        planChanged = sigExisting(existingPlan || []) !== sigNew(newPlanResolved);

        if (planChanged) {
          await supabase.from('contract_plan_activities').delete().eq('contract_id', id);
          if (newPlanResolved.length > 0) {
            const { data: planRows, error: planErr } = await supabase
              .from('contract_plan_activities')
              .insert(
                newPlanResolved.map((a, i) => ({
                  company_id: profile.company_id,
                  contract_id: id,
                  contract_item_id: a.contract_item_id ?? null,
                  catalog_activity_id: a.catalog_activity_id ?? null,
                  form_template_id: a.form_template_id ?? null,
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

      // 4) Carrega as OSs do contrato ANTES do gate: precisamos saber se há
      //    visita futura pra decidir o auto-heal (contrato ativo zerado/reativado).
      const todayStr = todayStrSaoPaulo();

      const { data: contractOss } = await supabase
        .from('service_orders')
        .select('id, scheduled_date, status, public_short_code')
        .eq('contract_id', id);

      const hasFutureVisits = (contractOss || []).some(
        o => (o.scheduled_date ?? '') >= todayStr,
      );

      // Gate único (pure helper): contrato ativo regenera quando o cronograma
      // mudou OU quando está sem visita futura (auto-heal / reativação). Contrato
      // inativo ou ativo-saudável-sem-mudança → no-op.
      if (!shouldRegenerateVisits({ newStatus, scheduleChanged, hasFutureVisits })) {
        return { regenerated: false, deletedCount: 0, createdCount: 0, reassignedCount };
      }

      // Regeneráveis: status agendada/pendente E futuras (scheduled_date >= hoje).
      // ⚠️ NÃO apaga aqui (P0 "gerar antes de apagar"). Os ids são capturados e
      // só serão removidos por regenerateFutureVisits DEPOIS de gerar+validar as
      // novas — evitando a janela em que o contrato ficaria sem visita futura.
      const regenerableOss = (contractOss || []).filter(o =>
        REGENERABLE_OS_STATUSES.has(o.status ?? '') &&
        (o.scheduled_date ?? '') >= todayStr
      );
      const regenerableIds = regenerableOss
        .map(o => o.id)
        .filter(Boolean) as string[];
      // Mês + código público das antigas → preservar o link compartilhado por mês.
      const regenerableOldOss: OldOsForPreserve[] = regenerableOss.map(o => ({
        scheduled_date: o.scheduled_date ?? null,
        public_short_code: (o as any).public_short_code ?? null,
      }));

      // Parâmetros efetivos (input quando veio, senão o atual).
      const effStart = (input.start_date ?? current.start_date) as string;
      const effFreqType = (input.frequency_type ?? current.frequency_type) as 'days' | 'months';
      const effFreqValue = (input.frequency_value ?? current.frequency_value) as number;
      const effHorizon = (input.horizon_months ?? current.horizon_months) as number;

      // Plano efetivo pra geração: o novo JÁ RESOLVIDO+DEDUPADO (se informado) ou
      // o persistido atual. ⚠️ Tem que ser `newPlanResolved` (não `newPlan`): o
      // motor por máquina roteia pela `contract_item_id`, que a UI não preenche
      // (manda só equipment_ref). Sem isso, expande pra todas as máquinas (×N).
      let effPlan: PlanActivityInput[] = newPlanResolved;
      let effPlanIds: (string | null)[] = insertedPlanRows.map(r => r.id);
      if (plan_activities === undefined) {
        // Plano não veio no input → usar o que já está no banco.
        const { data: persisted } = await supabase
          .from('contract_plan_activities')
          .select('id, description, guidance, section, component, freq_code, freq_months, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, applies_per_equipment, form_template_id')
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
          form_template_id: a.form_template_id,
        }));
        effPlanIds = (persisted ?? []).map((a: any) => a.id);
      } else if (!planChanged) {
        // Plano informado mas igual ao persistido → reusar ids existentes.
        effPlanIds = insertedPlanRows.map(r => r.id);
      }

      const useGroupedEngine = effPlan.length > 0;

      // Itens/equipamentos e executores do contrato pra reidratar as OSs novas.
      // Lê DEPOIS do diff (2.5) → já reflete o novo conjunto de equipamentos.
      // Inclui escopo + fase (motor por máquina). Lê ANTES de buildContractVisits
      // pra alimentar as máquinas do motor.
      const { data: contractItemsRows } = await supabase
        .from('contract_items')
        .select('id, equipment_id, pmoc_scope, pmoc_start_visit, sort_order, form_template_id, form_template_ids')
        .eq('contract_id', id);
      const itemRows = (contractItemsRows ?? []) as ContractItemMachineRow[];
      const equipmentIds = itemRows
        .map((i) => i.equipment_id)
        .filter(Boolean) as string[];
      // M5 — checklists efetivos por equipamento (regeneração de visitas futuras
      // segue a MESMA regra da criação: N linhas por checklist).
      const equipmentTemplateMap: Record<string, string[]> = {};
      for (const it of itemRows) {
        if (!it.equipment_id) continue;
        equipmentTemplateMap[it.equipment_id] = effectiveItemTemplateIds(
          it.form_template_ids,
          it.form_template_id,
        );
      }
      // Mapa item→equipamento pra atividades amarradas a um item específico.
      const itemEquipmentMap: Record<string, string | null> = {};
      for (const it of itemRows) {
        itemEquipmentMap[it.id] = it.equipment_id ?? null;
      }
      const machines = machinesFromItemRows(itemRows);

      // Gera só visitas do mês de hoje em diante (passado preservado). Motor por
      // máquina quando há máquinas + plano; senão agrupado/legado.
      const visits = buildContractVisits(
        {
          startDate: new Date(effStart + 'T12:00:00'),
          frequencyType: effFreqType,
          frequencyValue: effFreqValue,
          horizonMonths: effHorizon,
          planActivities: effPlan,
          planActivityIds: effPlanIds,
          machines: machines.length > 0 ? machines : undefined,
        },
        todayStr,
      );

      const effTechnicianId = input.technician_id !== undefined ? input.technician_id : null;
      const effTeamId = input.team_id !== undefined ? input.team_id : null;
      const assigneeUserIds = assignee_user_ids && assignee_user_ids.length > 0
        ? assignee_user_ids
        : (effTechnicianId ? [effTechnicianId] : []);

      const effName = (input.name ?? current.name ?? '') || 'Contrato';
      const effCustomerId = (input.customer_id ?? current.customer_id) as string;
      // Regeneração SEGURA (P0/P1): gera+valida as novas e SÓ DEPOIS apaga as
      // antigas (regenerableIds). Fonte única compartilhada com as outras
      // mutations de edição. Erro de geração propaga (toast) sem apagar nada.
      const { createdCount, deletedCount } = await regenerateFutureVisits({
        companyId: profile.company_id,
        contractId: id,
        visits,
        oldRegenerableIds: regenerableIds,
        oldRegenerableOss: regenerableOldOss,
        contractName: effName,
        useGroupedEngine,
        customerId: effCustomerId,
        technicianId: effTechnicianId,
        teamId: effTeamId,
        serviceTypeId: input.service_type_id ?? null,
        formTemplateId: input.form_template_id ?? null,
        equipmentIds,
        itemEquipmentMap,
        equipmentTemplateMap,
        assigneeUserIds,
        createdBy: user?.id || null,
      });

      return { regenerated: true, deletedCount, createdCount, reassignedCount };
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
        .select('id, equipment_id, item_name, item_description')
        .eq('contract_id', id);
      // FIX B — mesma chave do updateContract: item manual = `manual:<nome>:<desc>`
      // pra desambiguar homônimos. Derivada do conteúdo persistido → no-op estável.
      const itemKey = (it: { equipment_id?: string | null; item_name: string; item_description?: string | null }) =>
        it.equipment_id
          ? `eq:${it.equipment_id}`
          : `manual:${(it.item_name || '').trim().toLowerCase()}:${(it.item_description || '').trim().toLowerCase()}`;

      const existingByKey = new Map<string, { id: string }>();
      for (const it of (existingItems ?? []) as { id: string; equipment_id: string | null; item_name: string; item_description: string | null }[]) {
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

      // 2) Carrega OSs ANTES do gate (auto-heal precisa saber de visita futura).
      const todayStr = todayStrSaoPaulo();

      const { data: contractOss } = await supabase
        .from('service_orders')
        .select('id, scheduled_date, status, public_short_code')
        .eq('contract_id', id);

      const hasFutureVisits = (contractOss || []).some(
        o => (o.scheduled_date ?? '') >= todayStr,
      );

      // Gate único: contrato ativo regenera quando os itens mudaram OU está sem
      // visita futura (auto-heal). Inativo ou ativo-saudável-sem-mudança → no-op.
      if (!shouldRegenerateVisits({ newStatus: current.status as string, scheduleChanged: itemsChanged, hasFutureVisits })) {
        return { regenerated: false, deletedCount: 0, createdCount: 0 };
      }

      // ⚠️ Captura os ids regeneráveis mas NÃO apaga aqui (P0 "gerar antes de
      // apagar"): regenerateFutureVisits remove só após gerar+validar as novas.
      const regenerableOss = (contractOss || []).filter(o =>
        REGENERABLE_OS_STATUSES.has(o.status ?? '') &&
        (o.scheduled_date ?? '') >= todayStr
      );
      const regenerableIds = regenerableOss
        .map(o => o.id)
        .filter(Boolean) as string[];
      // Mês + código público das antigas → preservar o link compartilhado por mês.
      const regenerableOldOss: OldOsForPreserve[] = regenerableOss.map(o => ({
        scheduled_date: o.scheduled_date ?? null,
        public_short_code: (o as any).public_short_code ?? null,
      }));

      // Plano persistido atual (não muda na aba de equipamentos).
      const { data: persisted } = await supabase
        .from('contract_plan_activities')
        .select('id, description, guidance, section, component, freq_code, freq_months, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, applies_per_equipment, form_template_id')
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
        form_template_id: a.form_template_id,
      }));
      const effPlanIds: (string | null)[] = (persisted ?? []).map((a: any) => a.id);

      const useGroupedEngine = effPlan.length > 0;

      // Lê os itens DEPOIS do diff → reflete o novo conjunto de equipamentos.
      // Inclui escopo + fase (motor por máquina). Lê ANTES de buildContractVisits.
      const { data: contractItemsRows } = await supabase
        .from('contract_items')
        .select('id, equipment_id, pmoc_scope, pmoc_start_visit, sort_order, form_template_id, form_template_ids')
        .eq('contract_id', id);
      const itemRows = (contractItemsRows ?? []) as ContractItemMachineRow[];
      const equipmentIds = itemRows
        .map((i) => i.equipment_id)
        .filter(Boolean) as string[];
      // M5 — checklists efetivos por equipamento (regeneração de visitas futuras
      // segue a MESMA regra da criação: N linhas por checklist).
      const equipmentTemplateMap: Record<string, string[]> = {};
      for (const it of itemRows) {
        if (!it.equipment_id) continue;
        equipmentTemplateMap[it.equipment_id] = effectiveItemTemplateIds(
          it.form_template_ids,
          it.form_template_id,
        );
      }
      const itemEquipmentMap: Record<string, string | null> = {};
      for (const it of itemRows) {
        itemEquipmentMap[it.id] = it.equipment_id ?? null;
      }
      const machines = machinesFromItemRows(itemRows);

      const visits = buildContractVisits(
        {
          startDate: new Date(current.start_date + 'T12:00:00'),
          frequencyType: current.frequency_type as 'days' | 'months',
          frequencyValue: current.frequency_value as number,
          horizonMonths: current.horizon_months as number,
          planActivities: effPlan,
          planActivityIds: effPlanIds,
          machines: machines.length > 0 ? machines : undefined,
        },
        todayStr,
      );

      const effTechnicianId = (current.technician_id as string | null) ?? null;
      const effTeamId = (current.team_id as string | null) ?? null;
      const assigneeUserIds = effTechnicianId ? [effTechnicianId] : [];
      const effName = (current.name as string | null) || 'Contrato';

      // Regeneração SEGURA (P0/P1): gera+valida antes de apagar as antigas.
      const { createdCount, deletedCount } = await regenerateFutureVisits({
        companyId: profile.company_id,
        contractId: id,
        visits,
        oldRegenerableIds: regenerableIds,
        oldRegenerableOss: regenerableOldOss,
        contractName: effName,
        useGroupedEngine,
        customerId: current.customer_id as string,
        technicianId: effTechnicianId,
        teamId: effTeamId,
        serviceTypeId: (current.service_type_id as string | null) ?? null,
        formTemplateId: (current.form_template_id as string | null) ?? null,
        equipmentIds,
        itemEquipmentMap,
        equipmentTemplateMap,
        assigneeUserIds,
        createdBy: user?.id || null,
      });

      return { regenerated: true, deletedCount, createdCount };
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
        .select('id, description, guidance, section, component, freq_code, freq_months, is_measurement, unit, expected_min, expected_max, contract_item_id, catalog_activity_id, applies_per_equipment, form_template_id')
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
        form_template_id: a.form_template_id,
      }));
      const effPlanIds: (string | null)[] = (persisted ?? []).map((a: any) => a.id);
      const useGroupedEngine = effPlan.length > 0;

      // Equipamentos / mapa item→equipamento + máquinas (escopo + fase) do
      // contrato. Lê ANTES de buildContractVisits pra alimentar o motor por máquina.
      const { data: contractItemsRows } = await supabase
        .from('contract_items')
        .select('id, equipment_id, pmoc_scope, pmoc_start_visit, sort_order, form_template_id, form_template_ids')
        .eq('contract_id', id);
      const itemRows = (contractItemsRows ?? []) as ContractItemMachineRow[];
      const equipmentIds = itemRows
        .map((i) => i.equipment_id)
        .filter(Boolean) as string[];
      // M5 — checklists efetivos por equipamento (regeneração de visitas futuras
      // segue a MESMA regra da criação: N linhas por checklist).
      const equipmentTemplateMap: Record<string, string[]> = {};
      for (const it of itemRows) {
        if (!it.equipment_id) continue;
        equipmentTemplateMap[it.equipment_id] = effectiveItemTemplateIds(
          it.form_template_ids,
          it.form_template_id,
        );
      }
      const itemEquipmentMap: Record<string, string | null> = {};
      for (const it of itemRows) {
        itemEquipmentMap[it.id] = it.equipment_id ?? null;
      }
      const machines = machinesFromItemRows(itemRows);

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
          machines: machines.length > 0 ? machines : undefined,
        },
        fromStr,
      );

      // Índice base pra numerar as novas visitas em sequência às existentes.
      const baseIndex = (contractOss || []).length;

      const effTechnicianId = (current.technician_id as string | null) ?? null;
      const effTeamId = (current.team_id as string | null) ?? null;
      const assigneeUserIds = effTechnicianId ? [effTechnicianId] : [];
      const effName = (current.name as string | null) || 'Contrato';

      // Reusa a fonte única de persistência (P1) com deleteOld=false: a
      // renovação SÓ gera o tail novo (numerado a partir de baseIndex) e NÃO
      // apaga nenhuma OS existente. A validação assertAllVisitsPersisted está
      // embutida em regenerateFutureVisits.
      const { createdCount: addedCount } = await regenerateFutureVisits({
        companyId: profile.company_id,
        contractId: id,
        visits,
        oldRegenerableIds: [],
        baseVisitIndex: baseIndex,
        deleteOld: false,
        contractName: effName,
        useGroupedEngine,
        customerId: current.customer_id as string,
        technicianId: effTechnicianId,
        teamId: effTeamId,
        serviceTypeId: (current.service_type_id as string | null) ?? null,
        formTemplateId: (current.form_template_id as string | null) ?? null,
        equipmentIds,
        itemEquipmentMap,
        equipmentTemplateMap,
        assigneeUserIds,
        createdBy: user?.id || null,
      });

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
