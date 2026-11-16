import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
import { usePdvCoverExchange, type PdvExchangeCoverageInput } from './usePdvAfterSale';
import { PDV_COUPONS_ROOT } from './usePdvCoupons';

const input: PdvExchangeCoverageInput = {
  orderId: 'source', returnId: 'return', newOrderId: 'target', voucherId: 'voucher',
  voucherAmount: '8.00', creditAmount: '0.00', differenceMethod: null,
  differenceAccountId: null, cashSessionId: null, attemptId: 'stable-attempt', couponRevision: 2, targetCashSessionId: 'target-session',
};
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const key = [...PDV_COUPONS_ROOT, 'list', 'company-A', 'actor-A'];
  client.setQueryData(key, { usageCount: 0 });
  const stockKeys = ['pdv-stock-reservations', 'pdv-stock-availability', 'pdv-direct-sale-v2', 'pdv-counter', 'inventory', 'inventory-stock-levels', 'inventory-movements'].map(root => [root, 'company-A', 'actor-A']);
  stockKeys.forEach(stockKey => client.setQueryData(stockKey, { available: 10 }));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, key, stockKeys, ...renderHook(usePdvCoverExchange, { wrapper }) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null }); });

describe('troca com cupom na mutation canônica', () => {
  it('envia a revisão recebida e invalida o uso promocional mesmo sem callback da tela', async () => {
    const view = setup();
    await act(async () => { await view.result.current.mutateAsync(input); });
    expect(mocks.rpc).toHaveBeenCalledWith('pdv_cover_exchange_order_coupon_v2', expect.objectContaining({ p_expected_coupon_revision: 2, p_target_cash_session_id: 'target-session', p_cash_session_id: null, p_idempotency_key: 'stable-attempt', p_voucher_amount: '8.00' }));
    expect(view.client.getQueryState(view.key)?.isInvalidated).toBe(true);
    view.stockKeys.forEach(stockKey => expect(view.client.getQueryState(stockKey)?.isInvalidated).toBe(true));
  });

  it('nega contexto de destino ausente antes do RPC e não invalida sucesso', async () => {
    const view = setup();
    await act(async () => { await expect(view.result.current.mutateAsync({ ...input, targetCashSessionId: null })).rejects.toThrow('confirme o caixa de destino'); });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(view.client.getQueryState(view.key)?.isInvalidated).toBe(false);
  });

  it('mapeia revogação do caixa sem expor detalhes internos', async () => {
    const view = setup();
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private target SQL', details: 'code=pdv_exchange_target_cash_denied' } });
    await act(async () => { await expect(view.result.current.mutateAsync(input)).rejects.toThrow('O caixa de destino mudou'); });
    expect(view.client.getQueryState(view.key)?.isInvalidated).toBe(false);
  });

  it('recupera falha de rede com exatamente a mesma chave e payload', async () => {
    const view = setup();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'network unavailable' } });
    await act(async () => { await expect(view.result.current.mutateAsync(input)).rejects.toThrow('Verifique sua conexão'); });
    expect(view.client.getQueryState(view.key)?.isInvalidated).toBe(false);
    view.stockKeys.forEach(stockKey => expect(view.client.getQueryState(stockKey)?.isInvalidated).toBe(false));
    await act(async () => { await view.result.current.mutateAsync(input); });
    expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);
    expect(view.client.getQueryState(view.key)?.isInvalidated).toBe(true);
    view.stockKeys.forEach(stockKey => expect(view.client.getQueryState(stockKey)?.isInvalidated).toBe(true));
  });

  it('mapeia conflito de revisão em PT-BR sem anunciar uso confirmado', async () => {
    const view = setup();
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'SQL private context', details: 'code=pdv_coupon_conflict' } });
    await act(async () => { await expect(view.result.current.mutateAsync(input)).rejects.toThrow('O desconto do novo pedido mudou'); });
    expect(view.client.getQueryState(view.key)?.isInvalidated).toBe(false);
    view.stockKeys.forEach(stockKey => expect(view.client.getQueryState(stockKey)?.isInvalidated).toBe(false));
  });
});
