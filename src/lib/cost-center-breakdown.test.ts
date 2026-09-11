import { describe, it, expect } from 'vitest';
import {
  buildCostCenterBreakdown,
  filterByCostCenters,
  NO_COST_CENTER,
  type CostCenterTxnLike,
} from './cost-center-breakdown';

const entrada = (amount: number | string, cost_center_id?: string | null): CostCenterTxnLike =>
  ({ transaction_type: 'entrada', amount, cost_center_id });
const saida = (amount: number | string, cost_center_id?: string | null): CostCenterTxnLike =>
  ({ transaction_type: 'saida', amount, cost_center_id });

describe('buildCostCenterBreakdown', () => {
  it('soma dos centros + balde sem centro é EXATAMENTE o total', () => {
    const txns = [
      entrada(1000, 'obra-a'),
      entrada(250.5, 'obra-b'),
      entrada(99.9, null),
      entrada(10, undefined),
      saida(300, 'obra-a'),
      saida(120.25, 'obra-b'),
      saida(7.77, null),
    ];

    const { rows, totals } = buildCostCenterBreakdown(txns);

    const somaReceita = rows.reduce((s, r) => s + r.revenueCents, 0);
    const somaDespesa = rows.reduce((s, r) => s + r.expenseCents, 0);

    expect(somaReceita).toBe(totals.revenueCents);
    expect(somaDespesa).toBe(totals.expenseCents);
    // Total é o que a DRE mostra: 1000 + 250,50 + 99,90 + 10 = 1360,40
    expect(totals.revenue).toBeCloseTo(1360.4, 2);
    expect(totals.expense).toBeCloseTo(428.02, 2);
  });

  it('fecha com centavos que não dividem redondo (1000/3, 0,01/2)', () => {
    // Rateio típico de parcelamento: 333,33 + 333,33 + 333,34 = 1000,00
    const txns = [
      entrada(333.33, 'obra-a'),
      entrada(333.33, 'obra-b'),
      entrada(333.34, null),
      // Centavo solto, o caso que mais estoura soma em ponto flutuante.
      saida(0.01, 'obra-a'),
      saida(0.1, 'obra-b'),
      saida(0.2, 'obra-b'),
      saida(0.07, null),
    ];

    const { rows, totals } = buildCostCenterBreakdown(txns);

    expect(rows.reduce((s, r) => s + r.revenueCents, 0)).toBe(totals.revenueCents);
    expect(rows.reduce((s, r) => s + r.expenseCents, 0)).toBe(totals.expenseCents);
    expect(totals.revenueCents).toBe(100000);
    // 0,01 + 0,10 + 0,20 + 0,07 = 0,38 (em float cru daria 0,38000000000000006)
    expect(totals.expenseCents).toBe(38);
    expect(totals.result).toBeCloseTo(999.62, 2);
  });

  it('nunca perde lançamento: soma bate com o total cru do conjunto', () => {
    const txns = [
      entrada(10.1, 'a'), entrada(20.2, 'b'), entrada(30.3, null),
      entrada(0.05, 'a'), saida(5.55, 'b'), saida(1.11, null), saida(2.22, 'c'),
    ];
    const { rows, totals } = buildCostCenterBreakdown(txns);

    const cruReceita = Math.round(
      txns.filter((t) => t.transaction_type === 'entrada')
        .reduce((s, t) => s + Math.round(Number(t.amount) * 100), 0),
    );
    const cruDespesa = txns.filter((t) => t.transaction_type !== 'entrada')
      .reduce((s, t) => s + Math.round(Number(t.amount) * 100), 0);

    expect(totals.revenueCents).toBe(cruReceita);
    expect(totals.expenseCents).toBe(cruDespesa);
    expect(rows.reduce((s, r) => s + r.revenueCents + r.expenseCents, 0))
      .toBe(cruReceita + cruDespesa);
  });

  it('agrupa por centro, com resultado = receita menos despesa', () => {
    const { rows } = buildCostCenterBreakdown([
      entrada(500, 'obra-a'),
      saida(200, 'obra-a'),
      saida(50, 'obra-b'),
    ]);
    const a = rows.find((r) => r.id === 'obra-a')!;
    const b = rows.find((r) => r.id === 'obra-b')!;
    expect(a.revenue).toBe(500);
    expect(a.expense).toBe(200);
    expect(a.result).toBe(300);
    expect(b.revenue).toBe(0);
    expect(b.result).toBe(-50);
  });

  it('string vazia conta como "sem centro" (não vira balde fantasma)', () => {
    const { rows } = buildCostCenterBreakdown([
      entrada(100, ''),
      entrada(100, null),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBeNull();
    expect(rows[0].revenue).toBe(200);
  });

  it('respeita a ordem pedida e joga o balde sem centro pro fim', () => {
    const { rows } = buildCostCenterBreakdown(
      [entrada(1, null), entrada(1, 'z'), entrada(1, 'a'), entrada(1, 'fora-da-ordem')],
      ['a', 'z', 'inexistente'],
    );
    expect(rows.map((r) => r.id)).toEqual(['a', 'z', 'fora-da-ordem', null]);
  });

  it('conjunto vazio devolve zero, sem balde', () => {
    const { rows, totals } = buildCostCenterBreakdown([]);
    expect(rows).toEqual([]);
    expect(totals.revenueCents).toBe(0);
    expect(totals.expenseCents).toBe(0);
  });
});

describe('filterByCostCenters', () => {
  const txns = [
    { id: '1', cost_center_id: 'a' },
    { id: '2', cost_center_id: 'b' },
    { id: '3', cost_center_id: null },
    { id: '4', cost_center_id: undefined },
  ];

  it('vazio = todos', () => {
    expect(filterByCostCenters(txns, []).map((t) => t.id)).toEqual(['1', '2', '3', '4']);
  });

  it('filtra por centro selecionado', () => {
    expect(filterByCostCenters(txns, ['a']).map((t) => t.id)).toEqual(['1']);
    expect(filterByCostCenters(txns, ['a', 'b']).map((t) => t.id)).toEqual(['1', '2']);
  });

  it('balde "sem centro de custo" pega null e undefined', () => {
    expect(filterByCostCenters(txns, [NO_COST_CENTER]).map((t) => t.id)).toEqual(['3', '4']);
  });

  it('combina centro + balde sem centro', () => {
    expect(filterByCostCenters(txns, ['b', NO_COST_CENTER]).map((t) => t.id))
      .toEqual(['2', '3', '4']);
  });
});
