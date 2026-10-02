// ─────────────────────────────────────────────────────────────────────────────
// activityAggregate — monta a linha-resumo de CADA vendedor pra tabela, pro
// export e pra lista de dias sem registro da aba Atividade Comercial.
//
// Pura de propósito (sem Supabase, sem React): reusa só as contas de
// `@/utils/salespersonActivityStats` (sumActivity/activityCoverage/goalAdherence),
// nunca reimplementa. Decisões documentadas aqui porque o briefing deixou em
// aberto pro dev desta tela decidir:
//
// 1. Vendedor INATIVO sem NENHUM registro no período não entra — polui a
//    tabela sem ajudar o gestor. Inativo COM histórico no período (ex:
//    desligado no meio do mês) continua, porque esse dado importa pro
//    relatório do mês em que ele ainda trabalhava.
// 2. "% de aderência à meta" (coluna única) é a MÉDIA simples da aderência de
//    contatos e da aderência de reuniões agendadas — não é um terceiro cálculo
//    novo, é a combinação das duas métricas que JÁ têm meta definida pelo CEO
//    (reuniões realizadas e vendas não têm meta, então não entram na média).
// ─────────────────────────────────────────────────────────────────────────────

import {
  sumActivity,
  activityCoverage,
  goalAdherence,
  type ActivityCounters,
  type DailyActivityRow,
} from '@/utils/salespersonActivityStats';

export interface SalespersonActivityLite {
  id: string;
  name: string;
  photo_url: string | null;
  is_active: boolean;
  daily_goal_contacts: number;
  daily_goal_meetings_scheduled: number;
}

export interface SalespersonActivityAggregate {
  id: string;
  name: string;
  photoUrl: string | null;
  isActive: boolean;
  counters: ActivityCounters;
  businessDaysCount: number;
  /** "18/40" — períodos preenchidos sobre períodos esperados (2 por dia útil). */
  filledPeriodsLabel: string;
  /** 'yyyy-MM-dd', ordem crescente. */
  missingDays: string[];
  missingDaysCount: number;
  partialDaysCount: number;
  coveragePercent: number;
  goalContactsDaysMet: number;
  goalMeetingsDaysMet: number;
  /** Ver nota 2 no cabeçalho do arquivo. */
  adherencePercent: number;
}

export function buildSalespersonActivityAggregates(
  salespeople: readonly SalespersonActivityLite[],
  rows: readonly DailyActivityRow[],
  fromKey: string,
  toKey: string,
  todayKey: string,
): SalespersonActivityAggregate[] {
  return salespeople
    .map((sp): SalespersonActivityAggregate => {
      const spRows = rows.filter((r) => r.salesperson_id === sp.id);
      const counters = sumActivity(spRows);
      const coverage = activityCoverage(spRows, fromKey, toKey, todayKey);
      const goalContacts = goalAdherence(spRows, coverage.businessDays, sp.daily_goal_contacts, 'contacts');
      const goalMeetings = goalAdherence(
        spRows,
        coverage.businessDays,
        sp.daily_goal_meetings_scheduled,
        'meetings_scheduled',
      );

      const filledPeriods = coverage.completeDays.length * 2 + coverage.partialDays.length;
      const expectedPeriods = coverage.businessDays.length * 2;

      return {
        id: sp.id,
        name: sp.name,
        photoUrl: sp.photo_url,
        isActive: sp.is_active !== false,
        counters,
        businessDaysCount: coverage.businessDays.length,
        filledPeriodsLabel: `${filledPeriods}/${expectedPeriods}`,
        missingDays: coverage.missingDays,
        missingDaysCount: coverage.missingDays.length,
        partialDaysCount: coverage.partialDays.length,
        coveragePercent: coverage.coveragePercent,
        goalContactsDaysMet: goalContacts.daysMet,
        goalMeetingsDaysMet: goalMeetings.daysMet,
        adherencePercent: (goalContacts.adherencePercent + goalMeetings.adherencePercent) / 2,
      };
    })
    .filter((agg) => agg.isActive || hasAnyActivity(agg.counters));
}

function hasAnyActivity(counters: ActivityCounters): boolean {
  return (
    counters.contacts > 0 ||
    counters.meetings_scheduled > 0 ||
    counters.meetings_held > 0 ||
    counters.sales_count > 0
  );
}

/** Soma dos `daily_goal_*` dos vendedores ATIVOS — é a "meta do time" usada
 * como `ReferenceLine` no gráfico agregado (que soma todos os vendedores por
 * dia). Vendedor inativo não entra: ele não é mais esperado a bater meta. */
export function teamDailyGoal(
  salespeople: readonly SalespersonActivityLite[],
  field: 'daily_goal_contacts' | 'daily_goal_meetings_scheduled',
): number {
  return salespeople.filter((sp) => sp.is_active !== false).reduce((sum, sp) => sum + (sp[field] || 0), 0);
}
