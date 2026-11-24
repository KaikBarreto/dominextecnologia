import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
import { useDirectMaterialPurchase, type DirectMaterialPurchaseInput } from './useDirectMaterialPurchase';
const input: DirectMaterialPurchaseInput = { clientRequestId: 'same-request', stockId: 'stock', supplierId: 'supplier',
  items: [{ inventory_id: 'material', quantity: 10, unit_price: 10 }], purchaseDate: '2026-11-16', accountId: 'bank',
  categoryId: 'category', isPaid: true, paidDate: '2026-11-16', paymentMethod: 'pix', supplierCreditAmount: 40,
  cashContext: { sessionId: 'session', terminalId: 'terminal', stockId: 'stock' } };
function setup() { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  return { ...renderHook(() => useDirectMaterialPurchase(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }), invalidate }; }
describe('compra com saldo parcial e complemento monetário', () => {
  beforeEach(() => { vi.clearAllMocks(); state.rpc.mockResolvedValue({ data: { compra_id: 'purchase' }, error: null }); });
  it('envia a intenção do saldo e os itens; o servidor calcula o complemento canônico', async () => {
    const { result, invalidate } = setup(); await act(async () => { await result.current.registerPurchase.mutateAsync(input); });
    expect(state.rpc).toHaveBeenCalledWith('pdv_register_direct_purchase_mixed_v4', expect.objectContaining({ p_supplier_credit_amount: 40,
      p_items: input.items, p_payment_method: 'pix', p_account_id: 'bank', p_client_request_id: 'same-request', p_cash_session_id: 'session' }));
    expect(state.rpc.mock.calls[0][1]).not.toHaveProperty('p_monetary_amount');
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-supplier-credit'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account-balances'] });
  });
  it('reenvia a mesma chave e o mesmo lote depois de resposta de rede perdida', async () => {
    const { result } = setup(); state.rpc.mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') });
    await act(async () => { await expect(result.current.registerPurchase.mutateAsync(input)).rejects.toThrow(); });
    await act(async () => { await result.current.registerPurchase.mutateAsync(input); });
    expect(state.rpc.mock.calls[1]).toEqual(state.rpc.mock.calls[0]);
  });
  it('preserva o writer antigo para rascunhos de saldo total sem campo novo', async () => {
    const { result } = setup(); await act(async () => { await result.current.registerPurchase.mutateAsync({ ...input, supplierCreditAmount: undefined, paymentMethod: 'saldo_fornecedor' }); });
    expect(state.rpc.mock.calls[0][0]).toBe('pdv_register_direct_purchase_supplier_credit_v3');
  });
  it('recusa saldo aplicado em compra pendente ou não finito antes de escrever', async () => {
    const { result } = setup();
    await act(async () => { await expect(result.current.registerPurchase.mutateAsync({ ...input, isPaid: false })).rejects.toThrow('Revise'); });
    await act(async () => { await expect(result.current.registerPurchase.mutateAsync({ ...input, supplierCreditAmount: Infinity })).rejects.toThrow('Revise'); });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
