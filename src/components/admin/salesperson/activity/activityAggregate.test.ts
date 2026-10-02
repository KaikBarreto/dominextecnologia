import { describe, expect, it } from 'vitest';
import { buildSalespersonActivityAggregates, teamDailyGoal, type SalespersonActivityLite } from './activityAggregate';
import type { DailyActivityRow } from '@/utils/salespersonActivityStats';

// Semana útil: 2026-09-28 (seg) a 2026-10-02 (sex) — 5 dias úteis.
const FROM = '2026-09-28';
const TO = '2026-10-02';
const TODAY = '2026-10-05'; // posterior ao intervalo inteiro, não afeta o teto.

let seq = 0;
function row(
  salesperson_id: string,
  activity_date: string,
  period: 'morning' | 'afternoon',
  counters: Partial<Pick<DailyActivityRow, 'contacts' | 'meetings_scheduled' | 'meetings_held' | 'sales_count'>> = {},
): DailyActivityRow {
  seq += 1;
  return {
    id: `row-${seq}`,
    salesperson_id,
    activity_date,
    period,
    contacts: 0,
    meetings_scheduled: 0,
    meetings_held: 0,
    sales_count: 0,
    notes: null,
    created_at: `${activity_date}T12:00:00Z`,
    updated_at: `${activity_date}T12:00:00Z`,
    created_by: null,
    ...counters,
  };
}

const maicon: SalespersonActivityLite = {
  id: 'sp-maicon',
  name: 'Maicon',
  photo_url: null,
  is_active: true,
  daily_goal_contacts: 200,
  daily_goal_meetings_scheduled: 5,
};

const exVendedor: SalespersonActivityLite = {
  id: 'sp-ex',
  name: 'Ex-vendedor',
  photo_url: null,
  is_active: false,
  daily_goal_contacts: 200,
  daily_goal_meetings_scheduled: 5,
};

describe('buildSalespersonActivityAggregates', () => {
  it('soma contadores, cobertura e aderência por vendedor', () => {
    const rows = [
      row('sp-maicon', '2026-09-28', 'morning', { contacts: 120, meetings_scheduled: 3 }),
      row('sp-maicon', '2026-09-28', 'afternoon', { contacts: 90, meetings_scheduled: 3 }), // dia bate as 2 metas (210 contatos, 6 reuniões)
      row('sp-maicon', '2026-09-29', 'morning', { contacts: 50 }), // dia parcial, não bate meta
    ];

    const [agg] = buildSalespersonActivityAggregates([maicon], rows, FROM, TO, TODAY);

    expect(agg.counters).toEqual({ contacts: 260, meetings_scheduled: 6, meetings_held: 0, sales_count: 0 });
    expect(agg.businessDaysCount).toBe(5);
    expect(agg.missingDaysCount).toBe(3); // 30/09, 01/10, 02/10 sem nenhum período
    expect(agg.partialDaysCount).toBe(1); // 29/09 só manhã
    expect(agg.filledPeriodsLabel).toBe('3/10'); // 2 (dia completo) + 1 (parcial) = 3 de 10 esperados
    expect(agg.goalContactsDaysMet).toBe(1); // só 28/09 bateu 200 contatos
    expect(agg.goalMeetingsDaysMet).toBe(1); // só 28/09 bateu 5 reuniões
    // aderência = média(1/5, 1/5) = 20%
    expect(agg.adherencePercent).toBeCloseTo(20, 5);
  });

  it('vendedor inativo SEM registro no período não entra na lista', () => {
    const aggs = buildSalespersonActivityAggregates([maicon, exVendedor], [], FROM, TO, TODAY);
    expect(aggs.map((a) => a.id)).toEqual(['sp-maicon']);
  });

  it('vendedor inativo COM registro no período continua aparecendo', () => {
    const rows = [row('sp-ex', '2026-09-28', 'morning', { contacts: 10 })];
    const aggs = buildSalespersonActivityAggregates([maicon, exVendedor], rows, FROM, TO, TODAY);
    expect(aggs.map((a) => a.id).sort()).toEqual(['sp-ex', 'sp-maicon']);
  });
});

describe('teamDailyGoal', () => {
  it('soma a meta só dos vendedores ativos', () => {
    expect(teamDailyGoal([maicon, exVendedor], 'daily_goal_contacts')).toBe(200);
    expect(teamDailyGoal([maicon, { ...maicon, id: 'sp-2' }], 'daily_goal_meetings_scheduled')).toBe(10);
  });
});
