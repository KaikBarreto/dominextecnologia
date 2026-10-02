// Testes da agregação do Diário Comercial. São as contas que aparecem em DUAS
// telas (ficha do vendedor e espelho da listagem) — se divergirem, o CEO não
// sabe em qual número acreditar. Por isso o motor é puro e testado aqui.
//
// Semana de referência: 2026-09-28 (seg) … 2026-10-05 (seg).
// 2026-10-03 e 2026-10-04 são sábado e domingo.

import { describe, it, expect } from 'vitest';
import {
  activityCoverage,
  buildDailySeries,
  buildDayTotals,
  businessDaysBetween,
  conversionRates,
  findPeriodRow,
  fromDateKey,
  goalAdherence,
  previousDayKey,
  sumActivity,
  toDateKey,
  type DailyActivityRow,
} from '@/utils/salespersonActivityStats';
import type { ActivityPeriod } from '@/utils/activityArtFormat';

let seq = 0;

function row(
  activity_date: string,
  period: ActivityPeriod,
  counters: Partial<Pick<DailyActivityRow, 'contacts' | 'meetings_scheduled' | 'meetings_held' | 'sales_count'>> = {},
): DailyActivityRow {
  seq += 1;
  return {
    id: `row-${seq}`,
    salesperson_id: 'sp-1',
    activity_date,
    period,
    contacts: 0,
    meetings_scheduled: 0,
    meetings_held: 0,
    sales_count: 0,
    notes: null,
    created_at: `${activity_date}T12:00:00Z`,
    updated_at: `${activity_date}T12:00:00Z`,
    created_by: 'user-1',
    ...counters,
  };
}

describe('chaves de data', () => {
  it('converte Date em yyyy-MM-dd pelos componentes locais, sem off-by-one de fuso', () => {
    // 1º de janeiro à meia-noite local: com toISOString() em fuso negativo isto
    // viraria 2025-12-31. O helper tem que devolver o dia local.
    expect(toDateKey(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
    expect(toDateKey(new Date(2026, 9, 2, 23, 59, 59))).toBe('2026-10-02');
  });

  it('faz o caminho de volta ancorado ao meio-dia e rejeita chave inválida', () => {
    const d = fromDateKey('2026-10-02');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(12);
    expect(toDateKey(d!)).toBe('2026-10-02');

    expect(fromDateKey('02/10/2026')).toBeNull();
    expect(fromDateKey('')).toBeNull();
    expect(fromDateKey('2026-10')).toBeNull();
  });

  it('dá o dia anterior atravessando virada de mês', () => {
    expect(previousDayKey('2026-10-01')).toBe('2026-09-30');
    expect(previousDayKey('2026-01-01')).toBe('2025-12-31');
    expect(previousDayKey('xx')).toBeNull();
  });
});

describe('businessDaysBetween', () => {
  it('inclui as pontas e pula sábado e domingo', () => {
    expect(businessDaysBetween('2026-09-28', '2026-10-05')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-05',
    ]);
  });

  it('devolve o próprio dia quando ele é dia útil, e vazio quando é fim de semana', () => {
    expect(businessDaysBetween('2026-10-02', '2026-10-02')).toEqual(['2026-10-02']);
    expect(businessDaysBetween('2026-10-03', '2026-10-04')).toEqual([]);
  });

  it('devolve vazio em intervalo invertido ou chave inválida, sem explodir', () => {
    expect(businessDaysBetween('2026-10-05', '2026-09-28')).toEqual([]);
    expect(businessDaysBetween('bagunça', '2026-10-02')).toEqual([]);
  });
});

describe('sumActivity e buildDayTotals', () => {
  it('soma os quatro contadores', () => {
    const total = sumActivity([
      row('2026-09-28', 'morning', { contacts: 120, meetings_scheduled: 3, meetings_held: 2, sales_count: 1 }),
      row('2026-09-28', 'afternoon', { contacts: 90, meetings_scheduled: 2, meetings_held: 1, sales_count: 0 }),
    ]);
    expect(total).toEqual({ contacts: 210, meetings_scheduled: 5, meetings_held: 3, sales_count: 1 });
  });

  it('consolida por dia, conta períodos preenchidos e ordena do mais recente pro mais antigo', () => {
    const days = buildDayTotals([
      row('2026-09-28', 'morning', { contacts: 120 }),
      row('2026-09-28', 'afternoon', { contacts: 90 }),
      row('2026-09-29', 'morning', { contacts: 50 }),
      row('2026-10-01', 'afternoon', { contacts: 10 }),
    ]);

    expect(days.map((d) => d.date)).toEqual(['2026-10-01', '2026-09-29', '2026-09-28']);

    const seg = days.find((d) => d.date === '2026-09-28')!;
    expect(seg.filledPeriods).toBe(2);
    expect(seg.contacts).toBe(210);
    expect(seg.morning).not.toBeNull();
    expect(seg.afternoon).not.toBeNull();

    const ter = days.find((d) => d.date === '2026-09-29')!;
    expect(ter.filledPeriods).toBe(1);
    expect(ter.afternoon).toBeNull();
    expect(ter.contacts).toBe(50);

    const qui = days.find((d) => d.date === '2026-10-01')!;
    expect(qui.filledPeriods).toBe(1);
    expect(qui.morning).toBeNull();
  });

  it('acha a linha de um dia/período e devolve null quando não existe', () => {
    const rows = [row('2026-10-02', 'morning', { contacts: 7 })];
    expect(findPeriodRow(rows, '2026-10-02', 'morning')?.contacts).toBe(7);
    expect(findPeriodRow(rows, '2026-10-02', 'afternoon')).toBeNull();
    expect(findPeriodRow(rows, '2026-10-01', 'morning')).toBeNull();
  });
});

describe('conversionRates', () => {
  it('calcula o funil contato → agendada → realizada → venda', () => {
    const rates = conversionRates({
      contacts: 200,
      meetings_scheduled: 10,
      meetings_held: 8,
      sales_count: 2,
    });
    expect(rates.contactToScheduled).toBeCloseTo(5);
    expect(rates.scheduledToHeld).toBeCloseTo(80);
    expect(rates.heldToSale).toBeCloseTo(25);
  });

  it('devolve null (não NaN, não Infinity) quando o denominador é zero', () => {
    const rates = conversionRates({
      contacts: 0,
      meetings_scheduled: 0,
      meetings_held: 0,
      sales_count: 0,
    });
    expect(rates.contactToScheduled).toBeNull();
    expect(rates.scheduledToHeld).toBeNull();
    expect(rates.heldToSale).toBeNull();
  });

  it('não capa em 100% — mais reunião realizada do que agendada é dado, não erro', () => {
    const rates = conversionRates({
      contacts: 10,
      meetings_scheduled: 2,
      meetings_held: 3,
      sales_count: 0,
    });
    expect(rates.scheduledToHeld).toBeCloseTo(150);
  });
});

describe('activityCoverage', () => {
  const rows = [
    row('2026-09-28', 'morning', { contacts: 120 }),
    row('2026-09-28', 'afternoon', { contacts: 90 }),
    row('2026-09-29', 'morning', { contacts: 50 }),
  ];

  it('separa dias completos, parciais e em branco entre os dias úteis', () => {
    const cov = activityCoverage(rows, '2026-09-28', '2026-10-02', '2026-10-02');

    // Hoje (10-02) não é cobrado: a janela dele está aberta até a meia-noite.
    expect(cov.businessDays).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
    expect(cov.completeDays).toEqual(['2026-09-28']);
    expect(cov.partialDays).toEqual(['2026-09-29']);
    expect(cov.missingDays).toEqual(['2026-09-30', '2026-10-01']);
    // 3 períodos preenchidos de 8 esperados.
    expect(cov.coveragePercent).toBeCloseTo(37.5);
  });

  it('não acusa falta em dia futuro quando o filtro vai além de hoje', () => {
    const cov = activityCoverage(rows, '2026-09-28', '2026-10-30', '2026-09-30');
    expect(cov.businessDays).toEqual(['2026-09-28', '2026-09-29']);
    expect(cov.missingDays).toEqual([]);
  });

  it('não cobra nada quando o intervalo é só o dia de hoje', () => {
    const cov = activityCoverage(rows, '2026-10-02', '2026-10-02', '2026-10-02');
    expect(cov.businessDays).toEqual([]);
    expect(cov.coveragePercent).toBe(0);
  });

  it('ignora fim de semana na cobrança', () => {
    const cov = activityCoverage([], '2026-10-03', '2026-10-04', '2026-10-05');
    expect(cov.businessDays).toEqual([]);
    expect(cov.missingDays).toEqual([]);
  });
});

describe('goalAdherence', () => {
  const rows = [
    // 210 contatos no dia (bate a meta de 200)
    row('2026-09-28', 'morning', { contacts: 120, meetings_scheduled: 3 }),
    row('2026-09-28', 'afternoon', { contacts: 90, meetings_scheduled: 2 }),
    // 50 contatos (não bate)
    row('2026-09-29', 'morning', { contacts: 50, meetings_scheduled: 1 }),
  ];
  const businessDays = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];

  it('compara o TOTAL DO DIA com a meta, não o período isolado', () => {
    const adh = goalAdherence(rows, businessDays, 200, 'contacts');
    expect(adh.daysMet).toBe(1);
    expect(adh.businessDays).toBe(4);
    expect(adh.adherencePercent).toBeCloseTo(25);
  });

  it('conta dia sem registro como dia que não bateu — silêncio não pode sair barato', () => {
    const adh = goalAdherence([], businessDays, 200, 'contacts');
    expect(adh.daysMet).toBe(0);
    expect(adh.adherencePercent).toBe(0);
  });

  it('aplica a meta de 5 reuniões agendadas por dia', () => {
    const adh = goalAdherence(rows, businessDays, 5, 'meetings_scheduled');
    expect(adh.daysMet).toBe(1); // 09-28 somou 5; 09-29 somou 1
  });

  it('meta zero ou negativa não vira 100% de aderência nem NaN', () => {
    expect(goalAdherence(rows, businessDays, 0, 'contacts')).toMatchObject({
      goal: 0,
      daysMet: 0,
      adherencePercent: 0,
    });
    expect(goalAdherence(rows, businessDays, -10, 'contacts').goal).toBe(0);
  });

  it('intervalo sem dia útil devolve 0%, não divisão por zero', () => {
    const adh = goalAdherence(rows, [], 200, 'contacts');
    expect(adh.adherencePercent).toBe(0);
    expect(Number.isFinite(adh.adherencePercent)).toBe(true);
  });
});

describe('buildDailySeries', () => {
  it('devolve série contínua e crescente, com zero no dia útil sem registro', () => {
    const series = buildDailySeries(
      [
        row('2026-09-28', 'morning', { contacts: 120, sales_count: 1 }),
        row('2026-09-28', 'afternoon', { contacts: 90 }),
        row('2026-10-01', 'morning', { contacts: 30 }),
      ],
      ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'],
    );

    expect(series.map((p) => p.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ]);
    expect(series.map((p) => p.contacts)).toEqual([210, 0, 0, 30]);
    expect(series[0].sales_count).toBe(1);
    expect(series[1]).toMatchObject({ contacts: 0, meetings_scheduled: 0, meetings_held: 0, sales_count: 0 });
  });

  it('sem dia útil no intervalo, série vazia', () => {
    expect(buildDailySeries([row('2026-10-02', 'morning')], [])).toEqual([]);
  });
});
