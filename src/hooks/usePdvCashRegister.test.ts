import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));

import { attachReplacementOrderNumbers, type PdvSessionOrder } from './usePdvCashRegister';

function order(overrides: Partial<PdvSessionOrder> = {}): Omit<PdvSessionOrder, 'replaces_order_number'> {
  const { replaces_order_number: _ignored, ...row } = {
    id: 'order-current',
    number: 42,
    total: 100,
    subtotal: 100,
    discount_amount: 0,
    status: 'pago',
    customer_id: null,
    stock_id: null,
    notes: null,
    paid_at: '2026-10-19T20:00:00.000Z',
    created_at: '2026-10-19T20:00:00.000Z',
    replaces_order_id: null,
    replaces_order_number: null,
    salesperson_id: null,
    ...overrides,
  };

  return row;
}

describe('attachReplacementOrderNumbers', () => {
  it('anexa o número da venda substituída sem depender de relação embutida do PostgREST', () => {
    const orders = [order({ replaces_order_id: 'order-original' })];

    expect(
      attachReplacementOrderNumbers(orders, [{ id: 'order-original', number: 37 }]),
    ).toEqual([
      expect.objectContaining({
        id: 'order-current',
        replaces_order_id: 'order-original',
        replaces_order_number: 37,
      }),
    ]);
  });

  it('mantém número nulo quando não há substituição ou a origem não está visível por RLS', () => {
    const orders = [
      order({ id: 'ordinary-order' }),
      order({ id: 'hidden-source-order', replaces_order_id: 'other-company-order' }),
    ];

    expect(attachReplacementOrderNumbers(orders, [])).toEqual([
      expect.objectContaining({ id: 'ordinary-order', replaces_order_number: null }),
      expect.objectContaining({ id: 'hidden-source-order', replaces_order_number: null }),
    ]);
  });
});
