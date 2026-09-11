import { describe, it, expect } from 'vitest';
import { buildInstallmentRows } from './useFinancial';
import { buildInstallmentPlan } from '@/lib/finance-installments';

/**
 * Parcela que nasce diferente das irmãs fura relatório em silêncio — ninguém
 * olha 6 linhas uma a uma. O caso que motivou este teste é o `cost_center_id`:
 * se só a 1a parcela levasse o centro, a quebra por centro de custo mostraria
 * 1/6 do valor e o cliente acharia que "sumiu dinheiro".
 */
const baseRest = {
  transaction_type: 'saida' as const,
  description: 'Compressor',
  amount: 1200,
  transaction_date: '2026-01-31',
  category: 'Peças e materiais',
  account_id: 'acc-1',
  cost_center_id: 'cc-obra-shopping',
  is_paid: true,
};

describe('buildInstallmentRows', () => {
  it('TODAS as parcelas herdam o mesmo cost_center_id', () => {
    const plan = buildInstallmentPlan('2026-01-31', 1200, 6);
    const { rows } = buildInstallmentRows({
      rest: baseRest,
      plan,
      groupId: 'grp-1',
      companyId: 'co-1',
      createdBy: 'u-1',
      isCardInstallment: false,
      billDateFor: () => undefined,
    });

    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.cost_center_id === 'cc-obra-shopping')).toBe(true);
    expect(rows.map((r) => r.installment_number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.every((r) => r.installment_group_id === 'grp-1')).toBe(true);
    expect(rows.every((r) => r.company_id === 'co-1')).toBe(true);
  });

  it('parcela de CARTÃO também herda o centro, e nenhuma nasce paga', () => {
    const plan = buildInstallmentPlan('2026-01-31', 1200, 3);
    const { rows, billMonths } = buildInstallmentRows({
      rest: { ...baseRest, credit_card_bill_date: '2026-02-01' },
      plan,
      groupId: 'grp-2',
      companyId: 'co-1',
      isCardInstallment: true,
      // Cada parcela cai na fatura do mês do próprio vencimento.
      billDateFor: (dueDate) => `${dueDate.slice(0, 7)}-01`,
    });

    expect(rows.every((r) => r.cost_center_id === 'cc-obra-shopping')).toBe(true);
    // Invariante do domínio: despesa de cartão nunca nasce paga.
    expect(rows.every((r) => r.is_paid === false)).toBe(true);
    expect(rows.every((r) => r.paid_date === undefined)).toBe(true);
    expect(billMonths.sort()).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('sem centro de custo, nenhuma parcela inventa um (null, não string vazia)', () => {
    const plan = buildInstallmentPlan('2026-03-15', 300, 3);
    const { rows } = buildInstallmentRows({
      rest: { ...baseRest, cost_center_id: '' },
      plan,
      groupId: 'grp-3',
      companyId: 'co-1',
      isCardInstallment: false,
      billDateFor: () => undefined,
    });
    // normalizeOptionalForeignKeys transforma '' em null — senão o insert
    // estoura erro de FK.
    expect(rows.every((r) => r.cost_center_id === null)).toBe(true);
  });

  it('mês de calendário com clamp: 31/01 vira 28/02, nunca 03/03', () => {
    const plan = buildInstallmentPlan('2026-01-31', 900, 3);
    const { rows } = buildInstallmentRows({
      rest: baseRest,
      plan,
      groupId: 'grp-4',
      companyId: 'co-1',
      isCardInstallment: false,
      billDateFor: () => undefined,
    });
    expect(rows.map((r) => r.transaction_date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    // transaction_date = due_date em toda parcela (mês em que o caixa move).
    expect(rows.every((r) => r.transaction_date === r.due_date)).toBe(true);
  });

  it('parcelamento não-cartão: só a 1a pode nascer paga', () => {
    const plan = buildInstallmentPlan('2026-05-10', 500, 4);
    const { rows } = buildInstallmentRows({
      rest: baseRest,
      plan,
      groupId: 'grp-5',
      companyId: 'co-1',
      isCardInstallment: false,
      billDateFor: () => undefined,
    });
    expect(rows.map((r) => r.is_paid)).toEqual([true, false, false, false]);
    expect(rows[0].paid_date).toBe('2026-05-10');
  });

  it('a soma das parcelas bate com o total ao centavo', () => {
    const plan = buildInstallmentPlan('2026-01-15', 1000, 3);
    const { rows } = buildInstallmentRows({
      rest: { ...baseRest, amount: 1000 },
      plan,
      groupId: 'grp-6',
      companyId: 'co-1',
      isCardInstallment: false,
      billDateFor: () => undefined,
    });
    const cents = rows.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
    expect(cents).toBe(100000);
  });
});
