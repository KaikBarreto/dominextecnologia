import { describe, expect, it } from 'vitest';
import { buildFinanceReportOverview } from './finance-report-overview';
import type { FinancialTransaction } from '@/types/database';

const transaction = (
  id: string,
  overrides: Partial<FinancialTransaction> = {},
): FinancialTransaction => ({
  id,
  transaction_type: 'entrada',
  description: id,
  amount: 100,
  transaction_date: '2026-09-10',
  paid_date: '2026-09-10',
  is_paid: true,
  category: 'Serviços',
  created_at: '2026-09-10T12:00:00Z',
  updated_at: '2026-09-10T12:00:00Z',
  ...overrides,
});

describe('buildFinanceReportOverview', () => {
  it('faz KPIs, categorias, meses e centros fecharem no mesmo conjunto em centavos', () => {
    const transactions = [
      transaction('receita', { amount: 1000.1, cost_center_id: 'obra-a' }),
      transaction('imposto', { transaction_type: 'saida', amount: 100.05, category: 'ISS', cost_center_id: 'obra-a' }),
      transaction('custo', { transaction_type: 'saida', amount: 200.15, category: 'Material', cost_center_id: 'obra-b' }),
      transaction('opex', { transaction_type: 'saida', amount: 50.2, category: 'Aluguel', cost_center_id: null }),
      transaction('transferencia', { amount: 50_000, transfer_pair_id: 'par-interno' }),
      transaction('pendente', { amount: 99_999, is_paid: false, paid_date: null }),
      transaction('antes-do-corte', { amount: 75, transaction_date: '2026-08-31', paid_date: '2026-08-31' }),
    ];
    const groups = new Map([
      ['ISS', 'impostos'],
      ['Material', 'cmv'],
      ['Aluguel', 'opex'],
    ]);

    const result = buildFinanceReportOverview({
      transactions,
      regime: 'caixa',
      today: '2026-09-28',
      dreStartDate: '2026-09-01',
      categoryDreGroups: groups,
      costCenterOrder: ['obra-a', 'obra-b'],
    });

    expect(result.totals).toEqual({
      grossRevenue: 1000.1,
      expenses: 350.4,
      taxes: 100.05,
      netRevenue: 900.05,
      grossProfit: 699.9,
      result: 649.7,
      margin: expect.closeTo(69.98300169983),
    });
    expect(result.monthly).toEqual([{ key: '2026-09', revenue: 1000.1, expense: 350.4 }]);
    expect(result.revenueCategories).toEqual([{ name: 'Serviços', value: 1000.1 }]);
    expect(result.expenseCategories.map((row) => row.name)).toEqual(['Material', 'ISS', 'Aluguel']);
    expect(result.costCenters.reduce((total, row) => total + row.result, 0)).toBeCloseTo(649.7, 2);
    expect(result.movementCount).toBe(4);
  });

  it('respeita regime, datas futuras e recebimento parcial sem duplicar receita', () => {
    const transactions = [
      transaction('mae', { amount: 1000, amount_received: 300, paid_date: '2026-09-20' }),
      transaction('filha', {
        amount: 300,
        category: 'Recebimento parcial',
        parent_transaction_id: 'mae',
        paid_date: '2026-09-05',
      }),
      transaction('futura', { amount: 500, paid_date: '2026-10-01' }),
    ];

    const cash = buildFinanceReportOverview({
      transactions,
      regime: 'caixa',
      today: '2026-09-28',
    });
    expect(cash.totals.grossRevenue).toBe(1000);

    const accrual = buildFinanceReportOverview({
      transactions,
      regime: 'competencia',
      today: '2026-09-28',
    });
    expect(accrual.totals.grossRevenue).toBe(1500);
    expect(accrual.revenueCategories).toEqual([{ name: 'Serviços', value: 1500 }]);
  });

  it('não transforma aporte, empréstimo ou compra de ativo em resultado do DRE', () => {
    const result = buildFinanceReportOverview({
      transactions: [
        transaction('servico', { amount: 2_000 }),
        transaction('aporte', { amount: 20_000, category: 'Aporte de Sócios' }),
        transaction('emprestimo', { amount: 30_000, category: 'Empréstimo Bancário' }),
        transaction('ativo', {
          transaction_type: 'saida',
          amount: 8_000,
          category: 'Aquisição de Imobilizado',
        }),
      ],
      regime: 'caixa',
      today: '2026-09-28',
      categoryDreGroups: new Map([
        ['Serviços', 'opex'],
        ['Aporte de Sócios', 'outros'],
        ['Empréstimo Bancário', 'outros'],
        ['Aquisição de Imobilizado', 'outros'],
      ]),
    });

    expect(result.totals.grossRevenue).toBe(2_000);
    expect(result.totals.expenses).toBe(0);
    expect(result.totals.result).toBe(2_000);
    expect(result.movementCount).toBe(1);
  });
});
