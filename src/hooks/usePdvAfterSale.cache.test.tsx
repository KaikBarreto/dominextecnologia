import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { usePdvApplyVoucherToOrder, usePdvConfirmRefund, usePdvRequestRefund, usePdvReverseRefund } from './usePdvAfterSale';
const monetaryRoots = ['financial-summary', 'account-balances', 'financial-accounts', 'pdv-cofre-balance', 'pdv-cash-session-detail'];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity }, mutations: { retry: false } } });
  const keys = monetaryRoots.map(root => [root, 'scope', 'company-A', 'user-A']);
  keys.forEach(key => client.setQueryData(key, { amount: 120 }));
  return { client, keys, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
function useActions() { return { request: usePdvRequestRefund(), confirm: usePdvConfirmRefund(), reverse: usePdvReverseRefund() }; }
function run(value: ReturnType<typeof useActions>, kind: string) {
  if (kind === 'request') return value.request.mutateAsync({ orderId: 'order-A', returnId: 'source-A', paymentId: 'payment-A', amount: '15.00', reason: 'Motivo', accountId: 'cash-A', cashSessionId: 'session-A', attemptId: 'stable-key' });
  if (kind === 'confirm') return value.confirm.mutateAsync({ orderId: 'order-A', refundId: 'refund-A', accountId: 'bank-A', confirmationReference: 'FIXTURE', attemptId: 'stable-key' });
  return value.reverse.mutateAsync({ orderId: 'order-A', refundId: 'refund-A', reason: 'Motivo', attemptId: 'stable-key' });
}
beforeEach(() => { vi.clearAllMocks(); state.rpc.mockResolvedValue({ data: { ok: true }, error: null }); });
describe('reembolso atualiza fontes monetárias na mutation canônica', () => {
  it.each(['request', 'confirm', 'reverse'])('%s invalida saldos/resumos sem depender do componente', async kind => {
    const ctx = setup(); const view = renderHook(useActions, { wrapper: ctx.wrapper });
    await act(async () => { await run(view.result.current, kind); });
    ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated).toBe(true));
  });
  it.each(['request', 'confirm', 'reverse'])('%s negado não anuncia alteração nem invalida saldo confirmado', async kind => {
    const ctx = setup(); const view = renderHook(useActions, { wrapper: ctx.wrapper });
    state.rpc.mockResolvedValue({ data: null, error: { code: '42501', details: 'code=pdv_permission_denied' } });
    await act(async () => { await expect(run(view.result.current, kind)).rejects.toThrow(); });
    ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated).toBe(false));
  });
  it.each(['confirm', 'reverse'])('%s confirmado após desmontagem ainda invalida os fatos persistidos', async kind => {
    const ctx = setup(); let resolve!: (value: unknown) => void;
    state.rpc.mockImplementation(() => new Promise(r => { resolve = r; }));
    const view = renderHook(useActions, { wrapper: ctx.wrapper });
    let pending!: Promise<unknown>;
    await act(async () => { pending = run(view.result.current, kind); });
    view.unmount();
    await act(async () => { resolve({ data: { ok: true }, error: null }); await pending; });
    ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated).toBe(true));
  });
});


it('pré-aplicação desativada orienta checkout sem invalidar saldos como sucesso', async () => {
  const ctx = setup(); const view = renderHook(usePdvApplyVoucherToOrder, { wrapper: ctx.wrapper });
  state.rpc.mockResolvedValue({ data: null, error: { code: '42501', details: 'code=pdv_voucher_checkout_required', message: 'private_sql' } });
  await act(async () => { await expect(view.result.current.mutateAsync({ orderId: 'target', voucherId: 'voucher', amount: '2.00', attemptId: 'old-attempt' })).rejects.toThrow('Escolha os vouchers ao receber o pedido no caixa'); });
  ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated).toBe(false));
});
