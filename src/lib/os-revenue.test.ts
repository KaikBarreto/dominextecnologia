import { describe, it, expect } from 'vitest';
import {
  buildOsRevenueDescription,
  buildOsRevenuePrefill,
  resolveOsRevenueSuggestedAmount,
  type OsRevenueDescriptionMessages,
} from './os-revenue';
import type { OsRevenueContext } from '@/hooks/useOsFinishRevenuePrompt';

const T: OsRevenueDescriptionMessages = {
  descriptionWithCustomer: 'OS #{number} · {customer}',
  descriptionOsOnly: 'OS #{number}',
  descriptionFallback: 'Receita de Ordem de Serviço',
};

function ctx(over: Partial<OsRevenueContext> = {}): OsRevenueContext {
  return {
    serviceOrderId: 'os-1',
    osNumber: 123,
    customerId: 'cust-1',
    customerName: 'Fulano LTDA',
    suggestedAmount: 450.5,
    ...over,
  };
}

describe('buildOsRevenueDescription', () => {
  it('OS numerada + cliente', () => {
    expect(buildOsRevenueDescription(T, ctx())).toBe('OS #123 · Fulano LTDA');
  });

  it('OS numerada sem cliente', () => {
    expect(buildOsRevenueDescription(T, ctx({ customerName: null }))).toBe('OS #123');
  });

  it('sem número de OS, com cliente (ponto médio, nunca travessão)', () => {
    expect(buildOsRevenueDescription(T, ctx({ osNumber: null }))).toBe('Receita de Ordem de Serviço · Fulano LTDA');
  });

  it('sem número de OS e sem cliente — cai no fallback puro', () => {
    expect(buildOsRevenueDescription(T, ctx({ osNumber: null, customerName: null }))).toBe(
      'Receita de Ordem de Serviço',
    );
  });

  it('nome de cliente só com espaços conta como ausente', () => {
    expect(buildOsRevenueDescription(T, ctx({ customerName: '   ' }))).toBe('OS #123');
  });
});

describe('resolveOsRevenueSuggestedAmount', () => {
  it('devolve o número quando é finito', () => {
    expect(resolveOsRevenueSuggestedAmount(ctx({ suggestedAmount: 100 }))).toBe(100);
  });

  it('devolve null para null/undefined/NaN', () => {
    expect(resolveOsRevenueSuggestedAmount(ctx({ suggestedAmount: null }))).toBeNull();
    expect(resolveOsRevenueSuggestedAmount(ctx({ suggestedAmount: undefined }))).toBeNull();
    expect(resolveOsRevenueSuggestedAmount(ctx({ suggestedAmount: NaN }))).toBeNull();
  });
});

describe('buildOsRevenuePrefill', () => {
  it('monta o prefill de criação com o vínculo da OS e do cliente', () => {
    expect(buildOsRevenuePrefill(T, ctx())).toEqual({
      transaction_type: 'entrada',
      description: 'OS #123 · Fulano LTDA',
      amount: 450.5,
      service_order_id: 'os-1',
      customer_id: 'cust-1',
    });
  });

  it('sem valor sugerido, o amount nasce em 0 (editável no formulário)', () => {
    expect(buildOsRevenuePrefill(T, ctx({ suggestedAmount: null }))).toMatchObject({ amount: 0 });
  });

  it('sem cliente, a chave customer_id nem entra no objeto (não força null)', () => {
    const prefill = buildOsRevenuePrefill(T, ctx({ customerId: null }));
    expect(prefill).not.toHaveProperty('customer_id');
  });
});
