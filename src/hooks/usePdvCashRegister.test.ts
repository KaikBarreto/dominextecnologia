import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));

import {
  assertLegacyCashSessionContract,
  attachReplacementOrderNumbers,
  invalidatePdvCashRegisterCaches,
  selectLegacyOpenCashSessionForMutation,
  type PdvCashSession,
  type PdvSessionOrder,
} from './usePdvCashRegister';

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

function cashSession(overrides: Partial<PdvCashSession> = {}): PdvCashSession {
  return {
    id: 'cash-1',
    company_id: 'company-1',
    terminal_id: 'terminal-1',
    opened_by: 'operator-a',
    opened_at: '2026-11-07T10:00:00Z',
    opening_amount: 100,
    closed_by: null,
    closed_at: null,
    counted_amount: null,
    expected_amount: null,
    difference: null,
    status: 'aberta',
    notes: null,
    contract_version: 1,
    ...overrides,
  };
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

  it('invalida relatórios, materiais e Curva ABC nas mutations do caixa legado', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    await invalidatePdvCashRegisterCaches(client);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv', 'reports-v2'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['material-purchase-report'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'abc-report'] });
  });

  it('recusa seleção e mutation legadas para sessão contract_version 2', () => {
    const v2FromOperatorA = cashSession({
      id: 'cash-v2-operator-a',
      opened_by: 'operator-a',
      contract_version: 2,
    });
    expect(() => assertLegacyCashSessionContract(v2FromOperatorA))
      .toThrow('contrato novo');
    expect(() => selectLegacyOpenCashSessionForMutation([v2FromOperatorA], v2FromOperatorA.id))
      .toThrow('contrato novo');
  });

  it('aceita no writer anterior somente sessões NULL/1 abertas e carregadas', () => {
    const unclassifiedLegacy = cashSession({ id: 'legacy-null', contract_version: null });
    const classifiedLegacy = cashSession({ id: 'legacy-v1', contract_version: 1 });
    expect(selectLegacyOpenCashSessionForMutation([unclassifiedLegacy], 'legacy-null'))
      .toBe(unclassifiedLegacy);
    expect(selectLegacyOpenCashSessionForMutation([classifiedLegacy], 'legacy-v1'))
      .toBe(classifiedLegacy);
    expect(() => selectLegacyOpenCashSessionForMutation([classifiedLegacy], 'unknown'))
      .toThrow('não está disponível');
  });
});
