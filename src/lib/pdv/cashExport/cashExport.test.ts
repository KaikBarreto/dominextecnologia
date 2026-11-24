import { describe, expect, it } from 'vitest';
import { ALL_CASH_EXPORT_GROUPS, countCashExportMovements, filterCashExportPayload, mergePaymentSummaries, summarizeCashExportEntries } from './filters';
import { CASH_EXPORT_PAYMENT_OPTIONS, cashExportKindLabel, cashExportPaymentLabel } from './labels';
import { buildAllItemRows, buildAllMovementRows, toWallClockDate } from './rows';
import { addCivilDays, countCivilDays, resolveCashExportPeriod, validateCashExportPeriod } from './period';
import { buildCashExportFilename } from './filename';
import { describeCashExportFilters } from './describe';
import { makePayload, makeSession } from './fixture';
import type { CashExportFilters } from './types';

const all: CashExportFilters = { groups: ALL_CASH_EXPORT_GROUPS, paymentMethods: [...CASH_EXPORT_PAYMENT_OPTIONS], includeCancelled: false };
const ids = (filters: CashExportFilters) => filterCashExportPayload(makePayload(), filters).sessions[0].entries.map((e) => e.id);

describe('filtros do histórico de caixa', () => {
  it('sem restrição: tudo menos abertura e canceladas', () => {
    expect(ids(all)).toEqual(['s1a', 's1b', 's2', 'sup', 'wd', 'sh']);
  });
  it('incluir canceladas traz a venda cancelada', () => {
    expect(ids({ ...all, includeCancelled: true })).toContain('s3');
  });
  it('filtra por tipo', () => {
    expect(ids({ ...all, groups: ['sales'] })).toEqual(['s1a', 's1b', 's2']);
    expect(ids({ ...all, groups: ['withdrawals', 'supplies'] })).toEqual(['sup', 'wd']);
    expect(ids({ ...all, groups: ['closing_adjustments'] })).toEqual(['sh']);
  });
  it('filtra por forma de pagamento e descarta entradas sem forma quando restringe', () => {
    expect(ids({ ...all, paymentMethods: ['fiado'] })).toEqual(['s2']);
    expect(ids({ ...all, paymentMethods: ['dinheiro', 'pix'] })).toEqual(['s1a', 's1b', 'sup', 'wd']);
  });
  it('venda com 2 pagamentos: itens aparecem uma vez só', () => {
    const items = buildAllItemRows(filterCashExportPayload(makePayload(), all)).filter((i) => i.orderNumber === 1);
    expect(items.map((i) => i.name)).toEqual(['Filtro de ar', 'Gás R410A']);
  });
  it('se a forma primária sai pelo filtro, os itens passam para a entrada que ficou', () => {
    const filtered = filterCashExportPayload(makePayload(), { ...all, paymentMethods: ['dinheiro'] });
    const rows = buildAllItemRows(filtered).filter((i) => i.orderNumber === 1);
    expect(rows).toHaveLength(2);
    expect(filtered.sessions[0].entries.filter((e) => e.isOrderPrimary && e.orderId === 'o1')).toHaveLength(1);
  });
  it('conta movimentações para o aviso de vazio', () => {
    expect(countCashExportMovements(filterCashExportPayload(makePayload(), { ...all, groups: ['refunds'] }))).toBe(0);
  });
});

describe('resumo', () => {
  it('totais ignoram canceladas e ajustes de fechamento, que seguem na lista', () => {
    const filtered = filterCashExportPayload(makePayload(), { ...all, includeCancelled: true });
    const entries = filtered.sessions[0].entries;
    const summary = summarizeCashExportEntries(entries);
    const rows = buildAllMovementRows(filtered);
    expect(summary.totalIn).toBe(rows.reduce((s, r) => s + (r.entrada ?? 0), 0));
    expect(summary.totalIn).toBe(170); // 60+40+50+20, sem os 36 cancelados
    // A falta de caixa (R$ 5) aparece na lista, mas não entra em Saídas: só a sangria de R$ 30.
    expect(rows.reduce((s, r) => s + (r.saida ?? 0), 0)).toBe(35);
    expect(summary.totalOut).toBe(30);
    expect(summary.net).toBe(140);
    expect(summary.byPaymentMethod.some((row) => row.paymentMethod === null)).toBe(false);
    expect(summary.salesCount).toBe(2);
    expect(summary.cancelledSalesCount).toBe(1);
    expect(summary.movements).toBe(entries.length);
  });
  it('por forma de pagamento soma o mesmo total e junta caixas', () => {
    const filtered = filterCashExportPayload(makePayload([makeSession(), makeSession({ sessionId: 's2' })]), all);
    const summaries = filtered.sessions.map((s) => summarizeCashExportEntries(s.entries));
    const merged = mergePaymentSummaries(summaries);
    expect(merged.reduce((s, r) => s + r.net, 0)).toBe(summaries.reduce((s, x) => s + x.net, 0));
    expect(merged.find((r) => r.paymentMethod === 'pix')?.in).toBe(120);
  });
  it('venda cancelada vai na coluna de valor cancelado, não em entrada', () => {
    const rows = buildAllMovementRows(filterCashExportPayload(makePayload(), { ...all, includeCancelled: true }));
    const cancelled = rows.find((r) => r.isCancelled)!;
    expect(cancelled.entrada).toBeNull();
    expect(cancelled.cancelledValue).toBe(36);
  });
});

describe('rótulos, período e nome de arquivo', () => {
  it('rótulos PT-BR', () => {
    expect(cashExportKindLabel('withdrawal')).toBe('Sangria');
    expect(cashExportKindLabel('sale_payment')).toBe('Venda');
    expect(cashExportKindLabel('algo_novo')).toBe('Outra movimentação');
    expect(cashExportPaymentLabel('debito')).toBe('Cartão de débito');
    expect(cashExportPaymentLabel(null)).toBe('Sem forma de pagamento');
  });
  it('atalhos de período', () => {
    expect(resolveCashExportPeriod('today', '2026-11-19')).toEqual({ from: '2026-11-19', to: '2026-11-19' });
    expect(resolveCashExportPeriod('yesterday', '2026-03-01')).toEqual({ from: '2026-02-28', to: '2026-02-28' });
    expect(resolveCashExportPeriod('this_week', '2026-11-19')).toEqual({ from: '2026-11-16', to: '2026-11-19' });
    expect(resolveCashExportPeriod('this_month', '2026-11-19')).toEqual({ from: '2026-11-01', to: '2026-11-19' });
    expect(resolveCashExportPeriod('last_month', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolveCashExportPeriod('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
  it('valida período', () => {
    expect(validateCashExportPeriod('2026-11-01', '2026-11-30')).toBeNull();
    expect(validateCashExportPeriod('', '2026-11-30')).toMatch(/Informe/);
    expect(validateCashExportPeriod('2026-11-30', '2026-11-01')).toMatch(/depois/);
    expect(validateCashExportPeriod('2026-02-30', '2026-03-01')).toMatch(/válidas/);
    expect(countCivilDays('2026-01-01', '2026-04-02')).toBe(92);
    expect(validateCashExportPeriod('2026-01-01', '2026-04-02')).toBeNull();
    expect(validateCashExportPeriod('2026-01-01', '2026-04-03')).toMatch(/92 dias/);
    expect(addCivilDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('nome do arquivo', () => {
    expect(buildCashExportFilename({ scope: 'session', extension: 'xlsx', terminalName: 'Caixa Principal ção', closedDate: '2026-11-17' })).toBe('caixa-caixa-principal-cao-2026-11-17.xlsx');
    expect(buildCashExportFilename({ scope: 'period', extension: 'pdf', from: '2026-11-01', to: '2026-11-17' })).toBe('caixas-2026-11-01-a-2026-11-17.pdf');
    expect(buildCashExportFilename({ scope: 'period', extension: 'pdf', from: '2026-11-01', to: '2026-11-01' })).toBe('caixas-2026-11-01.pdf');
  });
  it('descreve filtros', () => {
    expect(describeCashExportFilters(all)).toBe('todos os tipos de movimentação; todas as formas de pagamento; sem vendas canceladas');
    expect(describeCashExportFilters({ ...all, groups: ['sales'], paymentMethods: ['pix'], includeCancelled: true })).toBe('Vendas; Pix; com vendas canceladas');
  });
  it('relógio de parede no fuso da empresa (23h30 em SP não vira o dia seguinte)', () => {
    expect(toWallClockDate('2026-11-03T02:30:00+00:00', 'America/Sao_Paulo').toISOString()).toBe('2026-11-02T23:30:00.000Z');
  });
});
