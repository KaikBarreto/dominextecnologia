import { describe, expect, it } from 'vitest';
import {
  buildFinanceCalendarDays,
  selectFinanceCalendarTransactions,
} from '@/lib/finance-calendar';

describe('buildFinanceCalendarDays', () => {
  it('gera semanas completas de domingo a sábado', () => {
    const days = buildFinanceCalendarDays(new Date(2026, 8, 15));

    expect(days).toHaveLength(35);
    expect(days[0].getDay()).toBe(0);
    expect(days.at(-1)?.getDay()).toBe(6);
    expect(days.some((day) => day.getMonth() === 8 && day.getDate() === 30)).toBe(true);
  });

  it('inclui seis semanas quando o mês ocupa toda a grade', () => {
    const days = buildFinanceCalendarDays(new Date(2026, 7, 1));

    expect(days).toHaveLength(42);
    expect([days[0].getFullYear(), days[0].getMonth() + 1, days[0].getDate()]).toEqual([2026, 7, 26]);
    const last = days.at(-1)!;
    expect([last.getFullYear(), last.getMonth() + 1, last.getDate()]).toEqual([2026, 9, 5]);
  });
});

describe('selectFinanceCalendarTransactions', () => {
  const novemberAccount = {
    id: 'november',
    transaction_type: 'saida' as const,
    is_paid: false,
    due_date: '2026-11-26',
    category: 'Fornecedores',
    cost_center_id: null,
  };
  const decemberAccount = {
    ...novemberAccount,
    id: 'december',
    due_date: '2026-12-10',
  };

  it('usa todos os períodos mesmo quando a lista está filtrada para um único mês', () => {
    const result = selectFinanceCalendarTransactions({
      periodTransactions: [novemberAccount],
      allTransactions: [novemberAccount, decemberAccount],
      subTab: 'pagar',
      status: 'todas',
      categoryFilter: [],
      costCenterFilter: [],
      today: new Date(2026, 10, 23),
      searchActive: false,
      matchesSearch: () => true,
    });

    expect(result.map((transaction) => transaction.id)).toEqual(['november', 'december']);
  });

  it('mantém os filtros de status e direção no conjunto completo', () => {
    const result = selectFinanceCalendarTransactions({
      periodTransactions: [],
      allTransactions: [
        novemberAccount,
        { ...decemberAccount, id: 'paid', is_paid: true },
        { ...decemberAccount, id: 'receivable', transaction_type: 'entrada' as const },
      ],
      subTab: 'pagar',
      status: 'pendentes',
      categoryFilter: [],
      costCenterFilter: [],
      today: new Date(2026, 10, 23),
      searchActive: false,
      matchesSearch: () => true,
    });

    expect(result.map((transaction) => transaction.id)).toEqual(['november']);
  });
});
