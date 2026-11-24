import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, authScope } = vi.hoisted(() => ({ rpc: vi.fn(), authScope: { companyId: 'company-a', permissions: ['screen:pdv'] as string[] } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator-1' }, profile: { company_id: authScope.companyId, user_id: 'operator-1', is_active: true }, permissions: authScope.permissions, roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  mapPdvDirectSaleV2Error,
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
  it('orienta conferir abertura e permissão sem exigir autoria própria do caixa', () => {
    expect(mapPdvDirectSaleV2Error({ details: 'code=pdv_direct_sale_session_invalid' }).message).toBe('O caixa selecionado não está disponível. Confira se está aberto e se você tem permissão para operá-lo.');
  });

  beforeEach(() => { vi.clearAllMocks(); authScope.companyId = 'company-a'; authScope.permissions = ['screen:pdv']; });

  it('preserva payload histórico sem cupom e separa desconto promocional de pagamentos', () => {
    const original = buildPdvDirectSaleV2RpcPayload(sale, 'legacy-key');
    expect(buildPdvDirectSaleV2RpcPayload({ ...sale, couponId: null, couponDiscountCents: 0 }, 'legacy-key')).toEqual(original);
    expect(original.p_cart).not.toHaveProperty('coupon_id');
    expect(original.p_cart).not.toHaveProperty('coupon_discount_cents');
    const promotional = buildPdvDirectSaleV2RpcPayload({ ...sale, couponId: 'coupon-id', couponDiscountCents: 2000 }, 'coupon-key');
    expect(promotional.p_cart).toMatchObject({ coupon_id: 'coupon-id', coupon_discount_cents: 2000, order_discount_amount: 0 });
    expect(promotional.p_payments).toEqual(original.p_payments);
  });

  it('falha fechado enquanto capability está indefinida ou em erro', () => {
    expect(selectPdvSaleContract({ loading: true, error: null })).toBe('blocked');
    expect(selectPdvSaleContract({ loading: false, error: new Error('rede') })).toBe('blocked');
    expect(selectPdvSaleContract({ loading: false, error: null, capability: { enabled: false, contractVersion: 2 } })).toBe('legacy');
    expect(selectPdvSaleContract({ loading: false, error: null, capability: { enabled: true, contractVersion: 2 } })).toBe('v2');
  });

  it('confirma a venda sem esperar consultas de relatório lentas, mantendo todas as invalidações', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'pdv_complete_direct_sale_rollout_v2') return { data: {
        order_id: 'order-confirmed', order_number: 12, delivery_id: 'delivery-confirmed', total: 10,
      }, error: null };
      if (name === 'pdv_get_direct_sale_capability_v2') return { data: { enabled: true, contract_version: 2 }, error: null };
      return { data: {}, error: null };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finishRefetch!: () => void;
    const slowRefetch = new Promise<void>(resolve => { finishRefetch = resolve; });
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockReturnValue(slowRefetch);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => usePdvDirectSaleV2(), { wrapper });
    let confirmed: string | undefined;
    try {
      await act(async () => {
        void hook.result.current.complete.mutateAsync({ ...sale,
          items: [{ ...sale.items[0], quantity: 1, unitPrice: 10 }],
          payments: [{ method: 'dinheiro', amount: 10, change_amount: 0 }],
        }).then(value => { confirmed = value.orderId; });
      });
      await waitFor(() => expect(confirmed).toBe('order-confirmed'));
      expect(hook.result.current.complete.isPending).toBe(false);
      const roots = invalidate.mock.calls.map(([filter]) => filter?.queryKey?.[0]);
      for (const root of ['inventory', 'financial-transactions', 'pdv-orders', 'pdv-direct-sale-v2', 'pdv-cash-sessions']) {
        expect(roots).toContain(root);
      }
      expect(rpc.mock.calls.filter(([name]) => name === 'pdv_complete_direct_sale_rollout_v2')).toHaveLength(1);
    } finally {
      await act(async () => { finishRefetch(); await slowRefetch; });
      hook.unmount(); client.clear();
    }
  });

  it('remove contatos visíveis ao trocar empresa e falha fechado sem permissão no novo catálogo', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === 'pdv_get_direct_sale_capability_v2') return { data: { enabled: true, contract_version: 2 }, error: null };
      if (authScope.companyId === 'company-b') return { data: null, error: { code: '42501', details: 'code=pdv_direct_sale_screen_denied' } };
      return { data: { customers: [{ id: 'customer-a', name: 'Cliente exemplo', document: '00000000000', phone: '1100000000' }] }, error: null };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(() => usePdvDirectSaleV2(), { wrapper });
    await waitFor(() => expect(result.current.catalog.isSuccess).toBe(true));
    expect(result.current.catalog.data?.customers[0].phone).toBe('1100000000');
    expect(rpc).toHaveBeenCalledWith('pdv_get_direct_sale_catalog_v3');
    authScope.companyId = 'company-b';
    rerender();
    expect(result.current.catalog.data).toBeUndefined();
    await waitFor(() => expect(result.current.catalog.isError).toBe(true));
    expect(result.current.catalog.data).toBeUndefined();
    expect(result.current.catalog.error?.message).not.toContain('pdv_direct_sale_screen_denied');
  });

  it('rejeita capability malformada ou de outra versão', () => {
    expect(() => projectPdvDirectSaleCapabilityV2({ enabled: true })).toThrow('versão segura');
    expect(() => projectPdvDirectSaleCapabilityV2({ enabled: true, contract_version: 1 })).toThrow('versão segura');
    expect(() => projectPdvDirectSaleCapabilityV2({ enabled: 'true', contract_version: 2 })).toThrow('versão segura');
    expect(projectPdvDirectSaleCapabilityV2({ enabled: false, contract_version: 2 }))
      .toEqual({ enabled: false, contractVersion: 2 });
  });

  it('reprojeta allowlist e preserva identificação do cliente e descarta custo, crédito e campos fiscais', () => {
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
    expect(projected.customers[0]).toEqual({ id: 'c1', name: 'Cliente', document: '000', email: 'x@example.invalid', phone: '1' });
    expect(projected.customers[0]).not.toHaveProperty('credit_limit');
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

  it('preserva a referência do voucher no payload e na assinatura do retry', () => {
    const voucherSale: PdvCompleteDirectSaleV2Input = {
      ...sale,
      payments: [{ method: 'voucher', amount: 20, reference_id: 'voucher-1' }],
    };
    const payload = buildPdvDirectSaleV2RpcPayload(voucherSale, 'key-voucher');
    expect(payload.p_payments).toEqual([
      { method: 'voucher', amount: 20, reference_id: 'voucher-1' },
    ]);
    expect(canonicalizePdvDirectSalePayments(voucherSale.payments)[0])
      .toMatchObject({ reference_id: 'voucher-1' });
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
      if (name === 'pdv_get_direct_sale_catalog_v3') return { data: { materials: [], customers: [], terminals: [], sessions: [], cash_account: null, bank_accounts: [] }, error: null };
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

  // O backend conserva os commits entre montagens. A tentativa persistida
  // precisa endereçar esse mesmo commit também após liberar o estado da UI.
  it('mantém um único pedido quando a resposta se perde após commit e a tela remonta com a tentativa persistida', async () => {
    const committed = new Map<string, { order_id: string; order_number: number; delivery_id: string; total: number }>();
    let loseResponse = true;
    rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'pdv_get_direct_sale_capability_v2') return { data: { enabled: true, contract_version: 2 }, error: null };
      if (name !== 'pdv_complete_direct_sale_rollout_v2') return { data: {}, error: null };
      const key = String(args?.p_idempotency_key);
      const replay = committed.has(key);
      if (!replay) {
        const count = committed.size + 1;
        committed.set(key, { order_id: `committed-order-${count}`, order_number: count, delivery_id: `delivery-${count}`, total: 0 });
      }
      // O backend gravou o pedido antes de perdermos o retorno de transporte.
      if (loseResponse) { loseResponse = false; throw new Error('Resposta perdida após commit'); }
      return { data: { ...committed.get(key), idempotent: replay }, error: null };
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const first = renderHook(() => usePdvDirectSaleV2(), { wrapper });
    await expect(first.result.current.complete.mutateAsync(sale)).rejects.toThrow('Resposta perdida após commit');
    expect(committed.size).toBe(1);
    first.unmount();
    const restored = renderHook(() => usePdvDirectSaleV2(), { wrapper });
    try {
      const recovered = await restored.result.current.complete.mutateAsync({ ...sale });
      expect(committed.size).toBe(1);
      expect(recovered.orderId).toBe('committed-order-1');
      expect(recovered.idempotent).toBe(true);
    } finally { restored.unmount(); queryClient.clear(); }
  });

  it('liberar estado local após o commit não habilita outro pedido para a mesma tentativa persistida', async () => {
    const committed = new Map<string, { order_id: string; order_number: number; delivery_id: string; total: number }>();
    rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'pdv_get_direct_sale_capability_v2') return { data: { enabled: true, contract_version: 2 }, error: null };
      if (name !== 'pdv_complete_direct_sale_rollout_v2') return { data: {}, error: null };
      const key = String(args?.p_idempotency_key);
      const replay = committed.has(key);
      if (!replay) {
        const count = committed.size + 1;
        committed.set(key, { order_id: `released-order-${count}`, order_number: count, delivery_id: `delivery-${count}`, total: 0 });
      }
      return { data: { ...committed.get(key), idempotent: replay }, error: null };
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const hook = renderHook(() => usePdvDirectSaleV2(), { wrapper });
    try {
      const confirmed = await hook.result.current.complete.mutateAsync(sale);
      expect(committed.size).toBe(1);
      hook.result.current.releaseAttempt(sale.attemptId);
      const recovered = await hook.result.current.complete.mutateAsync({ ...sale });
      expect(committed.size).toBe(1);
      expect(recovered.orderId).toBe(confirmed.orderId);
      expect(recovered.idempotent).toBe(true);
    } finally { hook.unmount(); queryClient.clear(); }
  });
  it('reutiliza a chave histórica exata quando ela foi preservada explicitamente', async () => {
    rpc.mockImplementation(async (name: string) => name === 'pdv_complete_direct_sale_rollout_v2'
      ? { data: { order_id: 'historical-order', order_number: 1, delivery_id: 'historical-delivery', total: 0, idempotent: true }, error: null }
      : { data: name === 'pdv_get_direct_sale_capability_v2' ? { enabled: true, contract_version: 2 } : {}, error: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const hook = renderHook(() => usePdvDirectSaleV2(), { wrapper });
    try {
      const result = await hook.result.current.complete.mutateAsync({ ...sale, idempotencyKey: 'direct-sale-historical-exact-key' });
      expect(result.orderId).toBe('historical-order');
      expect(rpc.mock.calls.find(([name]) => name === 'pdv_complete_direct_sale_rollout_v2')?.[1].p_idempotency_key).toBe('direct-sale-historical-exact-key');
    } finally { hook.unmount(); queryClient.clear(); }
  });
});
