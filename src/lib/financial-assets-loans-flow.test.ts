import { describe, expect, it } from 'vitest';
import type { FinancialTransaction } from '@/types/database';
import { buildCashFlowForecast, type ForecastAccount } from './cash-flow-forecast';
import { buildForecastEvents } from './cash-flow-forecast-sources';
import { calculateDfc, type DfcGroupKey } from './dfc';
import { isDreExcludedGroup } from './dre-regime';
import { filterCategoriesForSelect } from './financial-category-filter';

const TODAY = '2026-10-18';
const DUE_DATE = '2026-10-20';

const FLOWS = [
  { id: 'asset-buy', category: 'Aquisição de ativos', type: 'saida', amount: 6_000, dreGroup: 'outros', dfcGroup: 'investimento' },
  { id: 'asset-sale', category: 'Venda de ativos', type: 'entrada', amount: 4_000, dreGroup: 'outros', dfcGroup: 'investimento' },
  { id: 'loan-in', category: 'Empréstimos recebidos', type: 'entrada', amount: 10_000, dreGroup: 'outros', dfcGroup: 'financiamento' },
  { id: 'loan-principal', category: 'Amortização de empréstimos', type: 'saida', amount: 2_500, dreGroup: 'outros', dfcGroup: 'financiamento' },
] as const;

function transaction(
  flow: (typeof FLOWS)[number],
  paid: boolean,
): FinancialTransaction {
  return {
    id: flow.id,
    transaction_type: flow.type,
    amount: flow.amount,
    description: flow.category,
    category: flow.category,
    transaction_date: TODAY,
    due_date: paid ? null : DUE_DATE,
    paid_date: paid ? DUE_DATE : null,
    is_paid: paid,
    account_id: 'BANK',
    cancelled_at: null,
    transfer_pair_id: null,
    credit_card_bill_date: null,
    bill_id: null,
    parent_transaction_id: null,
  } as unknown as FinancialTransaction;
}

describe('ativos e empréstimos: ciclo do lançamento entre Previsto, Realizado, DRE e DFC', () => {
  it('oferece cada categoria no tipo correto de lançamento manual', () => {
    const categories = FLOWS.map((flow) => ({
      name: flow.category,
      type: flow.type,
      is_active: true,
    }));

    expect(filterCategoriesForSelect(categories, 'entrada').map((category) => category.name)).toEqual([
      'Venda de ativos',
      'Empréstimos recebidos',
    ]);
    expect(filterCategoriesForSelect(categories, 'saida').map((category) => category.name)).toEqual([
      'Aquisição de ativos',
      'Amortização de empréstimos',
    ]);
  });

  it('projeta as quatro obrigações abertas na data de vencimento e encadeia o saldo', () => {
    const { events, warnings } = buildForecastEvents({
      openTransactions: FLOWS.map((flow) => transaction(flow, false)),
      bills: [],
      projections: [],
      today: TODAY,
    });

    expect(warnings).toEqual([]);
    expect(events.map(({ direction, categoryName, dueDate, accountId }) => ({
      direction,
      categoryName,
      dueDate,
      accountId,
    }))).toEqual(FLOWS.map((flow) => ({
      direction: flow.type === 'entrada' ? 'in' : 'out',
      categoryName: flow.category,
      dueDate: DUE_DATE,
      accountId: 'BANK',
    })));

    const accounts: ForecastAccount[] = [
      { id: 'BANK', name: 'Banco', type: 'banco', isCashAccount: true },
    ];
    const forecast = buildCashFlowForecast({
      events,
      accounts,
      openingBalances: new Map([['BANK', 20_000]]),
      today: TODAY,
      horizonDays: 15,
    });
    const dueDay = forecast.days.find((day) => day.date === DUE_DATE)!;
    const nextDay = forecast.days.find((day) => day.date === '2026-10-21')!;

    expect(dueDay).toMatchObject({
      opening: 20_000,
      inflow: 14_000,
      outflow: 8_500,
      net: 5_500,
      closing: 25_500,
    });
    expect(dueDay.byAccount[0].closing).toBe(25_500);
    expect(nextDay.opening).toBe(25_500);
  });

  it('depois da baixa não duplica no Previsto e entra no grupo correto do DFC Realizado', () => {
    const paid = FLOWS.map((flow) => ({
      ...transaction(flow, true),
      dfc_group: flow.dfcGroup as DfcGroupKey,
    }));
    const forecastSource = buildForecastEvents({
      openTransactions: paid,
      bills: [],
      projections: [],
      today: TODAY,
    });
    expect(forecastSource.events).toEqual([]);

    const dfc = calculateDfc(paid, { from: DUE_DATE, to: DUE_DATE }, 20_000);
    const investment = dfc.groups.find((group) => group.key === 'investimento')!;
    const financing = dfc.groups.find((group) => group.key === 'financiamento')!;

    expect(investment.total).toBe(-2_000);
    expect(financing.total).toBe(7_500);
    expect(dfc).toMatchObject({
      totalInflow: 14_000,
      totalOutflow: -8_500,
      netChange: 5_500,
      closingBalance: 25_500,
    });
  });

  it('as quatro categorias patrimoniais ficam fora do DRE', () => {
    for (const flow of FLOWS) {
      expect(isDreExcludedGroup(flow.dreGroup)).toBe(true);
    }
  });
});
