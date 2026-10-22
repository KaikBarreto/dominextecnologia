import { describe, expect, it } from 'vitest';
import {
  calculateAdminDashboardPeriodMetrics,
  filterAdminDashboardCompaniesByCreatedAt,
} from './adminDashboardMetrics';

const start = new Date('2026-10-01T00:00:00-03:00');
const end = new Date('2026-10-31T23:59:59.999-03:00');

describe('adminDashboardMetrics', () => {
  it('conta vendas sale e first_sale somente dentro do período', () => {
    const metrics = calculateAdminDashboardPeriodMetrics(
      [
        { type: 'income', category: 'sale', amount: 100, transaction_date: '2026-10-03T10:00:00-03:00' },
        { type: 'income', category: 'first_sale', amount: 200, transaction_date: '2026-10-20' },
        { type: 'income', category: 'sale', amount: 300, transaction_date: '2026-09-30T23:59:59-03:00' },
        { type: 'expense', category: 'sale', amount: 400, transaction_date: '2026-10-10' },
      ],
      start,
      end,
    );

    expect(metrics).toEqual({ income: 300, salesCount: 2, renewalCount: 0 });
  });

  it('conta renovações agrupadas do sistema antigo', () => {
    const metrics = calculateAdminDashboardPeriodMetrics(
      [
        { type: 'income', category: 'renewal', amount: 90, transaction_date: '2026-10-02' },
        {
          type: 'income',
          category: 'receita_sistema_antigo',
          description: 'Importação (3 renovações)',
          amount: 270,
          transaction_date: '2026-10-03',
        },
      ],
      start,
      end,
    );

    expect(metrics.renewalCount).toBe(4);
  });

  it('mantém uma transação DATE no próprio dia em filtro personalizado', () => {
    const dayStart = new Date('2026-10-20T00:00:00');
    const dayEnd = new Date('2026-10-20T23:59:59.999');
    const metrics = calculateAdminDashboardPeriodMetrics(
      [{ type: 'income', category: 'sale', amount: 150, transaction_date: '2026-10-20' }],
      dayStart,
      dayEnd,
    );

    expect(metrics.salesCount).toBe(1);
  });

  it('filtra a origem pela criação e inclui todo o último dia', () => {
    const companies = [
      { id: 'antes', created_at: '2026-09-30T23:59:59-03:00' },
      { id: 'inicio', created_at: '2026-10-01T00:00:00-03:00' },
      { id: 'fim', created_at: '2026-10-31T22:45:00-03:00' },
      { id: 'depois', created_at: '2026-11-01T00:00:00-03:00' },
      { id: 'sem-data', created_at: null },
    ];

    expect(filterAdminDashboardCompaniesByCreatedAt(companies, start, end).map((item) => item.id)).toEqual([
      'inicio',
      'fim',
    ]);
  });
});
