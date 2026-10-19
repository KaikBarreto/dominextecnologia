import { describe, expect, it } from 'vitest';
import { filterStocksForCustomer, type Stock } from './useStocks';

function stock(id: string, customerId: string | null): Stock {
  return {
    id,
    company_id: 'company-1',
    name: id,
    is_default: id === 'general',
    // Todo local nasce 'operacional'; 'pdv' só existe com o módulo PDV contratado.
    purpose: 'operacional',
    sort_order: 0,
    created_at: '2026-10-13T00:00:00.000Z',
    updated_at: '2026-10-13T00:00:00.000Z',
    customer_id: customerId,
  };
}

describe('filterStocksForCustomer', () => {
  const stocks = [
    stock('general', null),
    stock('customer-a', 'customer-a'),
    stock('customer-b', 'customer-b'),
  ];

  it('mantém o fluxo padrão restrito aos estoques gerais', () => {
    expect(filterStocksForCustomer(stocks).map((item) => item.id)).toEqual(['general']);
  });

  it('expõe somente gerais e o estoque do cliente da OS', () => {
    expect(filterStocksForCustomer(stocks, 'customer-a').map((item) => item.id)).toEqual([
      'general',
      'customer-a',
    ]);
  });

  it('nunca expõe estoque de outro cliente quando não há correspondência', () => {
    expect(filterStocksForCustomer(stocks, 'customer-c').map((item) => item.id)).toEqual(['general']);
  });
});
