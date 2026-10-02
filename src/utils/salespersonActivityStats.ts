// ─────────────────────────────────────────────────────────────────────────────
// salespersonActivityStats — agregação PURA do diário comercial do vendedor.
//
// Mora fora do hook de propósito: a ficha do vendedor e o espelho da listagem
// precisam exatamente das mesmas contas (totais, funil, dias sem registro,
// aderência à meta). Se cada tela somasse do seu jeito, os dois números
// divergiriam e o CEO não saberia em qual acreditar.
//
// Nada aqui toca Supabase, React ou DOM — é tudo testável em isolamento.
//
// Régua de data: o painel Auctus roda na régua de Brasília (ver `@/lib/date-br`).
// Dia útil aqui é seg–sex. Feriado NÃO é descontado: `src/utils/holidays.ts`
// depende de cidade/estado do tenant, e o vendedor da Auctus não tem tenant.
// Se virar problema (muito "dia sem registro" em feriado nacional), descontar
// feriado nacional é a evolução natural.
// ─────────────────────────────────────────────────────────────────────────────

import { eachDayOfInterval, isWeekend } from 'date-fns';
import type { ActivityPeriod } from '@/utils/activityArtFormat';

/** Os 4 contadores do diário. Mesmos nomes das colunas, de propósito. */
export interface ActivityCounters {
  contacts: number;
  meetings_scheduled: number;
  meetings_held: number;
  sales_count: number;
}

/** Linha do diário (espelha `public.salesperson_daily_activity`). */
export interface DailyActivityRow extends ActivityCounters {
  id: string;
  salesperson_id: string;
  /** 'yyyy-MM-dd' (coluna `date`, já em régua BRT). */
  activity_date: string;
  period: ActivityPeriod;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export const ZERO_COUNTERS: ActivityCounters = {
  contacts: 0,
  meetings_scheduled: 0,
  meetings_held: 0,
  sales_count: 0,
};

/** Um dia consolidado: os dois períodos + o total do dia. */
export interface DayTotals extends ActivityCounters {
  /** 'yyyy-MM-dd' */
  date: string;
  morning: DailyActivityRow | null;
  afternoon: DailyActivityRow | null;
  /** 0, 1 ou 2 — quantos períodos foram preenchidos nesse dia. */
  filledPeriods: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Datas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converte um Date de calendário em 'yyyy-MM-dd' usando os componentes LOCAIS.
 * NÃO usa `toISOString()`, que converte pra UTC e devolve o dia anterior em
 * qualquer fuso negativo — o off-by-one clássico.
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converte 'yyyy-MM-dd' em Date ancorado ao MEIO-DIA local. Meio-dia e não
 * meia-noite pra que nenhuma conversão de fuso jogue o dia pra trás.
 * String inválida devolve `null` em vez de `Invalid Date`.
 */
export function fromDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Dias úteis (seg–sex) entre duas chaves 'yyyy-MM-dd', inclusive nas pontas.
 * Intervalo invertido ou chave inválida devolve `[]` em vez de explodir.
 */
export function businessDaysBetween(fromKey: string, toKey: string): string[] {
  const from = fromDateKey(fromKey);
  const to = fromDateKey(toKey);
  if (!from || !to || from > to) return [];
  return eachDayOfInterval({ start: from, end: to })
    .filter((d) => !isWeekend(d))
    .map(toDateKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// Somas e consolidação
// ─────────────────────────────────────────────────────────────────────────────

/** Soma os 4 contadores de um conjunto de linhas. */
export function sumActivity(rows: readonly DailyActivityRow[]): ActivityCounters {
  return rows.reduce<ActivityCounters>(
    (acc, row) => ({
      contacts: acc.contacts + (row.contacts || 0),
      meetings_scheduled: acc.meetings_scheduled + (row.meetings_scheduled || 0),
      meetings_held: acc.meetings_held + (row.meetings_held || 0),
      sales_count: acc.sales_count + (row.sales_count || 0),
    }),
    { ...ZERO_COUNTERS },
  );
}

/**
 * Consolida linhas em dias, **ordenado por data decrescente** (o mais recente
 * primeiro — é como a tela de histórico lista). Dois registros do mesmo período
 * no mesmo dia não existem (unique no banco); se aparecerem, o último vence.
 */
export function buildDayTotals(rows: readonly DailyActivityRow[]): DayTotals[] {
  const byDate = new Map<string, DayTotals>();

  for (const row of rows) {
    let day = byDate.get(row.activity_date);
    if (!day) {
      day = {
        date: row.activity_date,
        morning: null,
        afternoon: null,
        filledPeriods: 0,
        ...ZERO_COUNTERS,
      };
      byDate.set(row.activity_date, day);
    }
    if (row.period === 'morning') day.morning = row;
    else day.afternoon = row;
  }

  for (const day of byDate.values()) {
    const present = [day.morning, day.afternoon].filter(Boolean) as DailyActivityRow[];
    day.filledPeriods = present.length;
    Object.assign(day, sumActivity(present));
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Índice por data pra lookup O(1) na tela. */
export function indexDayTotals(days: readonly DayTotals[]): Map<string, DayTotals> {
  return new Map(days.map((d) => [d.date, d]));
}

/** Linha de um dia/período específico, ou `null` se não preenchido. */
export function findPeriodRow(
  rows: readonly DailyActivityRow[],
  dateKey: string,
  period: ActivityPeriod,
): DailyActivityRow | null {
  return rows.find((r) => r.activity_date === dateKey && r.period === period) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Funil
// ─────────────────────────────────────────────────────────────────────────────

/** Taxas do funil. `null` = denominador zero, ou seja "não dá pra calcular"
 * (a tela mostra "—"). Nunca NaN, nunca Infinity. */
export interface ConversionRates {
  /** contatos → reuniões agendadas */
  contactToScheduled: number | null;
  /** reuniões agendadas → realizadas (o complemento é o no-show) */
  scheduledToHeld: number | null;
  /** reuniões realizadas → vendas */
  heldToSale: number | null;
}

function rate(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  const pct = (numerator / denominator) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function conversionRates(counters: ActivityCounters): ConversionRates {
  return {
    contactToScheduled: rate(counters.meetings_scheduled, counters.contacts),
    scheduledToHeld: rate(counters.meetings_held, counters.meetings_scheduled),
    heldToSale: rate(counters.sales_count, counters.meetings_held),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cobertura: o que ele NÃO preencheu
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityCoverage {
  /** Dias úteis considerados (já aparados pelo limite superior). */
  businessDays: string[];
  /** Dias úteis sem nenhum período preenchido. */
  missingDays: string[];
  /** Dias úteis com só um dos dois períodos. */
  partialDays: string[];
  /** Dias úteis com os dois períodos. */
  completeDays: string[];
  /** Períodos preenchidos / períodos esperados (2 por dia útil), em %. */
  coveragePercent: number;
}

/**
 * Quais dias úteis do intervalo ficaram sem registro.
 *
 * `todayKey` é o teto: dia que ainda não aconteceu (ou o próprio hoje, que ele
 * ainda pode preencher até a meia-noite) NÃO conta como falta. Sem esse aparo,
 * escolher "este mês" no dia 2 acusaria 20 dias em branco e o relatório viraria
 * ruído. Passe `brtToday()` de `@/lib/date-br`.
 */
export function activityCoverage(
  rows: readonly DailyActivityRow[],
  fromKey: string,
  toKey: string,
  todayKey: string,
): ActivityCoverage {
  // Nem o dia de hoje entra na cobrança: a janela de preenchimento dele está
  // aberta até a meia-noite BRT.
  const ceiling = toKey < todayKey ? toKey : previousDayKey(todayKey);
  const businessDays = ceiling ? businessDaysBetween(fromKey, ceiling) : [];
  const byDate = indexDayTotals(buildDayTotals(rows));

  const missingDays: string[] = [];
  const partialDays: string[] = [];
  const completeDays: string[] = [];

  for (const day of businessDays) {
    const filled = byDate.get(day)?.filledPeriods ?? 0;
    if (filled === 0) missingDays.push(day);
    else if (filled === 1) partialDays.push(day);
    else completeDays.push(day);
  }

  const expectedPeriods = businessDays.length * 2;
  const filledPeriods = partialDays.length + completeDays.length * 2;

  return {
    businessDays,
    missingDays,
    partialDays,
    completeDays,
    coveragePercent: expectedPeriods > 0 ? (filledPeriods / expectedPeriods) * 100 : 0,
  };
}

/** Dia anterior a uma chave 'yyyy-MM-dd'. Chave inválida → `null`. */
export function previousDayKey(key: string): string | null {
  const date = fromDateKey(key);
  if (!date) return null;
  date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta diária (travada pelo CEO em 200 contatos / 5 reuniões agendadas por dia)
// ─────────────────────────────────────────────────────────────────────────────

/** Campos que têm meta. Reuniões realizadas e vendas não têm meta definida. */
export type GoalField = 'contacts' | 'meetings_scheduled';

export interface GoalAdherence {
  goal: number;
  /** Dias úteis em que o TOTAL DO DIA (manhã+tarde) bateu a meta. */
  daysMet: number;
  /** Dias úteis considerados (mesmo aparo de `activityCoverage`). */
  businessDays: number;
  /** daysMet / businessDays em %. Sem dia útil no intervalo → 0. */
  adherencePercent: number;
}

/**
 * Aderência à meta diária. A meta é por DIA, não por período — por isso soma
 * manhã + tarde antes de comparar.
 *
 * Dia sem registro conta como dia que NÃO bateu: não preencher não pode sair
 * mais barato do que preencher pouco, senão o indicador premia o silêncio.
 */
export function goalAdherence(
  rows: readonly DailyActivityRow[],
  businessDays: readonly string[],
  goal: number,
  field: GoalField,
): GoalAdherence {
  const byDate = indexDayTotals(buildDayTotals(rows));
  const safeGoal = goal > 0 ? goal : 0;

  let daysMet = 0;
  if (safeGoal > 0) {
    for (const day of businessDays) {
      if ((byDate.get(day)?.[field] ?? 0) >= safeGoal) daysMet += 1;
    }
  }

  return {
    goal: safeGoal,
    daysMet,
    businessDays: businessDays.length,
    adherencePercent: businessDays.length > 0 ? (daysMet / businessDays.length) * 100 : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Série diária pro gráfico (realizado vs meta)
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivitySeriesPoint {
  /** 'yyyy-MM-dd' — a tela formata pra exibição. */
  date: string;
  contacts: number;
  meetings_scheduled: number;
  meetings_held: number;
  sales_count: number;
}

/**
 * Série diária contínua (dia útil sem registro entra com zero), em ordem
 * CRESCENTE — é o que o Recharts espera no eixo X. Lacuna sem ponto faria a
 * linha de realizado "pular" o dia vazio e esconder exatamente o que o CEO
 * quer ver.
 */
export function buildDailySeries(
  rows: readonly DailyActivityRow[],
  businessDays: readonly string[],
): ActivitySeriesPoint[] {
  const byDate = indexDayTotals(buildDayTotals(rows));
  return businessDays.map((date) => {
    const day = byDate.get(date);
    return {
      date,
      contacts: day?.contacts ?? 0,
      meetings_scheduled: day?.meetings_scheduled ?? 0,
      meetings_held: day?.meetings_held ?? 0,
      sales_count: day?.sales_count ?? 0,
    };
  });
}
