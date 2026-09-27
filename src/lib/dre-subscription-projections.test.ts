import { describe, expect, it } from 'vitest';
import {
  buildDreSubscriptionProjections,
  shouldLoadDreSubscriptionProjections,
  type DreProjectionSubscription,
} from './dre-subscription-projections';

const monthly: DreProjectionSubscription = {
  id: 'sub-1',
  value: 250,
  cycle: 'MONTHLY',
  next_due_date: '2026-09-25',
  status: 'active',
  description: 'Plano mensal',
  category: 'Mensalidades',
  cost_center_id: 'cc-1',
  customer_id: 'customer-1',
  source_type: 'avulso',
  source_id: null,
};

describe('buildDreSubscriptionProjections', () => {
  it('gera somente os ciclos futuros dentro do período selecionado', () => {
    const result = buildDreSubscriptionProjections({
      subscriptions: [monthly],
      charges: [],
      transactions: [],
      rangeStart: '2026-09-01',
      rangeEnd: '2026-12-31',
      today: '2026-10-01',
    });

    expect(result.map((item) => item.cycleDate)).toEqual([
      '2026-10-25',
      '2026-11-25',
      '2026-12-25',
    ]);
    expect(result.reduce((sum, item) => sum + item.amount, 0)).toBe(750);
  });

  it('não projeta o ciclo que já virou cobrança real', () => {
    const result = buildDreSubscriptionProjections({
      subscriptions: [monthly],
      charges: [{ id: 'charge-1', subscription_id: 'sub-1', due_date: '2026-11-25' }],
      transactions: [],
      rangeStart: '2026-10-01',
      rangeEnd: '2026-12-31',
      today: '2026-10-01',
    });

    expect(result.map((item) => item.key)).toEqual([
      'sub-1:2026-10-25',
      'sub-1:2026-12-25',
    ]);
  });

  it('não duplica parcela financeira de contrato na mesma competência', () => {
    const result = buildDreSubscriptionProjections({
      subscriptions: [{ ...monthly, source_type: 'contract', source_id: 'contract-1' }],
      charges: [],
      transactions: [{
        contract_id: 'contract-1',
        due_date: '2026-10-25',
        transaction_date: '2026-10-01',
        transaction_type: 'entrada',
        cancelled_at: null,
      }],
      rangeStart: '2026-10-01',
      rangeEnd: '2026-11-30',
      today: '2026-10-01',
    });

    expect(result.map((item) => item.cycleDate)).toEqual(['2026-11-25']);
  });

  it('preserva a âncora de fim do mês sem derivar após fevereiro', () => {
    const result = buildDreSubscriptionProjections({
      subscriptions: [{ ...monthly, next_due_date: '2027-01-31' }],
      charges: [],
      transactions: [],
      rangeStart: '2027-01-01',
      rangeEnd: '2027-03-31',
      today: '2027-01-01',
    });

    expect(result.map((item) => item.cycleDate)).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });

  it('não projeta além do número máximo de ciclos da assinatura', () => {
    const result = buildDreSubscriptionProjections({
      subscriptions: [{ ...monthly, max_payments: 2 }],
      charges: [],
      transactions: [],
      rangeStart: '2026-09-01',
      rangeEnd: '2027-12-31',
      today: '2026-09-01',
    });

    expect(result.map((item) => item.cycleDate)).toEqual(['2026-09-25', '2026-10-25']);
  });

  it('desconta cobranças já materializadas do limite total de ciclos', () => {
    const result = buildDreSubscriptionProjections({
      subscriptions: [{ ...monthly, next_due_date: '2026-11-25', max_payments: 3 }],
      charges: [
        { id: 'charge-1', subscription_id: 'sub-1', due_date: '2026-09-25' },
        { id: 'charge-2', subscription_id: 'sub-1', due_date: '2026-10-25' },
      ],
      transactions: [],
      rangeStart: '2026-11-01',
      rangeEnd: '2027-02-28',
      today: '2026-11-01',
    });

    expect(result.map((item) => item.cycleDate)).toEqual(['2026-11-25']);
  });

  it('ignora assinatura não ativa e período sem data final', () => {
    const cancelled = { ...monthly, status: 'cancelled' };
    expect(buildDreSubscriptionProjections({
      subscriptions: [cancelled],
      charges: [],
      transactions: [],
      rangeStart: '2026-10-01',
      rangeEnd: '2026-12-31',
      today: '2026-10-01',
    })).toEqual([]);

    expect(buildDreSubscriptionProjections({
      subscriptions: [monthly],
      charges: [],
      transactions: [],
      rangeStart: null,
      rangeEnd: null,
      today: '2026-10-01',
    })).toEqual([]);
  });
});

describe('shouldLoadDreSubscriptionProjections', () => {
  it('só libera a query com módulo Cobranças, Competência, toggle e fim do período', () => {
    const base = {
      hasChargeModule: true,
      regime: 'competencia' as const,
      includeProjections: true,
      rangeEnd: '2026-12-31',
    };

    expect(shouldLoadDreSubscriptionProjections(base)).toBe(true);
    expect(shouldLoadDreSubscriptionProjections({ ...base, hasChargeModule: false })).toBe(false);
    expect(shouldLoadDreSubscriptionProjections({ ...base, regime: 'caixa' })).toBe(false);
    expect(shouldLoadDreSubscriptionProjections({ ...base, includeProjections: false })).toBe(false);
    expect(shouldLoadDreSubscriptionProjections({ ...base, rangeEnd: undefined })).toBe(false);
  });
});
