import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  buildPdvDirectSaleV2RpcPayload,
  canonicalizePdvDirectSalePayments,
  projectPdvDirectSaleCapabilityV2,
  projectPdvDirectSaleCatalogV2,
  resolvePdvDirectSaleAttemptV2,
  selectPdvSaleContract,
  usePdvDirectSaleV2,
  type PdvCompleteDirectSaleV2Input,
} from '@/hooks/usePdvDirectSaleV2';

const sale: PdvCompleteDirectSaleV2Input = {
  attemptId: 'draft-1', terminalId: 'terminal-1', cashSessionId: 'session-1', cashAccountId: 'cash-1',
  customerId: 'customer-1', orderDiscountAmount: 0, notes: ' Retirar hoje ', transactionDate: '2026-11-07',
  items: [{ inventoryId: 'material-1', stockId: 'stock-1', quantity: 2, unitPrice: 0, discountAmount: 0 }],
  payments: [{ method: 'dinheiro', amount: 0, change_amount: 10 }],
};

describe('usePdvDirectSaleV2', () => {
  beforeEach(() => vi.clearAllMocks());

  it('falha fechado enquanto capability está indefinida ou em erro', () => {
    expect(selectPdvSaleContract({ loading: true, error: null })).toBe('blocked');
    expect(selectPdvSaleContract({ loading: false, error: new Error('rede') })).toBe('blocked');
    expect(selectPdvSaleContract({ loading: false, error: null, capability: { enabled: false, contractVersion: 2 } })).toBe('legacy');
    expect(selectPdvSaleContract({ loading: false, error: null, capability: { enabled: true, contractVersion: 2 } })).toBe('v2');
  });

  it('rejeita capability malformada ou de outra versão', () => {
    expect(() => projectPdvDirectSaleCapabilityV2({ enabled: true })).toThrow('versão segura');
    expect(() => projectPdvDirectSaleCapabilityV2({ enabled: true, contract_version: 1 })).toThrow('versão segura');
    expect(() => projectPdvDirectSaleCapabilityV2({ enabled: 'true', contract_version: 2 })).toThrow('versão segura');
    expect(projectPdvDirectSaleCapabilityV2({ enabled: false, contract_version: 2 }))
      .toEqual({ enabled: false, contractVersion: 2 });
  });

  it('reprojeta allowlist e descarta custo, crédito, fiscal e contato', () => {
    const projected = projectPdvDirectSaleCatalogV2({
      materials: [{ id: 'm1', name: 'Material', sku: 'M1', barcode: '789', unit: 'un', sale_price: 12,
        group_id: 'group-1',
        image_url: null, cost_price: 9, fiscal_ncm: 'x', supplier: 'privado',
        available_by_stock: [{ stock_id: 's1', available_quantity: 3, has_conflict: false, cost: 9 }] }],
      customers: [{ id: 'c1', name: 'Cliente', credit_limit: 100, document: '000', email: 'x@example.invalid', phone: '1' }],
      terminals: [{ id: 't1', name: 'Terminal', stock_id: 's1', company_id: 'tenant' }], sessions: [],
      cash_account: { id: 'a1', name: 'Cofre', initial_balance: 999 }, bank_accounts: [],
    });
    expect(projected.materials[0]).not.toHaveProperty('cost_price');
    expect(projected.materials[0].groupId).toBe('group-1');
    expect(projected.materials[0].availableByStock[0]).toEqual({ stockId: 's1', availableQuantity: 3, hasConflict: false });
    expect(projected.customers[0]).toEqual({ id: 'c1', name: 'Cliente' });
    expect(projected.cashAccount).toEqual({ id: 'a1', name: 'Cofre' });
  });

  it('monta carrinho v2 sem custo e preserva o troco do dinheiro', () => {
    const payload = buildPdvDirectSaleV2RpcPayload(sale, 'key-1');
    expect(payload.p_cart).toEqual({
      items: [{ inventory_id: 'material-1', stock_id: 'stock-1', quantity: 2, unit_price: 0, discount_amount: 0 }],
      order_discount_amount: 0, notes: 'Retirar hoje', transaction_date: '2026-11-07',
    });
    expect(payload.p_payments).toEqual([{ method: 'dinheiro', amount: 0, change_amount: 10 }]);
    expect(JSON.stringify(payload)).not.toContain('unitCost');
    expect(JSON.stringify(payload)).toContain('change_amount');
  });

  it('reusa tentativa apenas quando a intenção de pagamento é idêntica', () => {
    const firstPayments = [
      { method: 'pix' as const, amount: 30, account_id: 'bank-1' },
      { method: 'fiado' as const, amount: 20, due_date: '2026-12-07' },
    ];
    const sameIntentReordered = [...firstPayments].reverse();
    const changedPayments = [{ method: 'credito' as const, amount: 50, account_id: 'bank-1' }];
    const base = JSON.stringify({ cart: 'same', payments: canonicalizePdvDirectSalePayments(firstPayments) });
    const same = JSON.stringify({ cart: 'same', payments: canonicalizePdvDirectSalePayments(sameIntentReordered) });
    const changed = JSON.stringify({ cart: 'same', payments: canonicalizePdvDirectSalePayments(changedPayments) });
    const ids = vi.fn().mockReturnValueOnce('attempt-1').mockReturnValueOnce('attempt-2');

    const attempt1 = resolvePdvDirectSaleAttemptV2(null, base, ids);
    const retry = resolvePdvDirectSaleAttemptV2(attempt1, same, ids);
    const attempt2 = resolvePdvDirectSaleAttemptV2(retry, changed, ids);

    expect(retry.id).toBe('attempt-1');
    expect(attempt2.id).toBe('attempt-2');
    expect(ids).toHaveBeenCalledTimes(2);
  });

  it('reusa a chave no retry e invalida todas as raízes afetadas após sucesso', async () => {
    let completionCalls = 0;
    rpc.mockImplementation(async (name: string) => {
      if (name === 'pdv_get_direct_sale_capability_v2') return { data: { enabled: true, contract_version: 2 }, error: null };
      if (name === 'pdv_get_direct_sale_catalog_v2') return { data: { materials: [], customers: [], terminals: [], sessions: [], cash_account: null, bank_accounts: [] }, error: null };
      completionCalls += 1;
      if (completionCalls === 1) return { data: null, error: { details: 'code=pdv_direct_sale_in_progress' } };
      return { data: { order_id: 'order-1', order_number: 42, delivery_id: 'delivery-1', subtotal: 0,
        discount_amount: 0, total: 0, idempotent: true }, error: null };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => usePdvDirectSaleV2(), { wrapper });
    await waitFor(() => expect(result.current.contract).toBe('v2'));
    await expect(result.current.complete.mutateAsync(sale)).rejects.toThrow('processamento');
    await act(async () => { await result.current.complete.mutateAsync(sale); });
    const calls = rpc.mock.calls.filter(([name]) => name === 'pdv_complete_direct_sale_rollout_v2');
    expect(calls).toHaveLength(2);
    expect(calls[0][1].p_idempotency_key).toBe(calls[1][1].p_idempotency_key);
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-direct-sale-v2'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['financial-transactions'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-stock-reservations'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-stock-availability'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv', 'reports-v2'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['material-purchase-report'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'abc-report'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-cash-sessions-v2'] });
    });
  });
});
