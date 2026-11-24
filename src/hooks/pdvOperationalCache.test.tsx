import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { usePdvPreorderActions } from './usePdvPreorders';
import { usePdvRequestRefund } from './usePdvAfterSale';
import { usePdvReverseReturn, usePdvCancelResidual } from './usePdvReturns';
import { invalidatePdvCashV2Caches } from './usePdvCashSessionsV2';
import { invalidatePdvOrderCancellationCaches } from './pdvOrderCancellationCache';

const orderKeys = [
  ['pdv', 'orders-workspace', 'scope', 'company', 'operator', { page: 0 }],
  ['pdv', 'orders-workspace', 'scope', 'company', 'operator', 'detail', 'order'],
  ['pdv-sales-flow', 'scope', 'company', 'operator'],
  ['pdv-sales-flow', 'scope', 'company', 'operator', 'order', 'order'],
  ['pdv-customer-history', 'scope', 'company', 'operator', 'customer'],
];
const catalogKeys = [['pdv-direct-sale-v2', 'catalog', 'scope', 'company', 'operator'], ['pdv-preorders', 'catalog', 'scope', 'company', 'operator']];
function setup(keys = [...orderKeys, ...catalogKeys]) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity }, mutations: { retry: false } } });
  keys.forEach(key => client.setQueryData(key, { version: 1 }));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper, keys };
}
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: { preorder_id: 'preorder', return_id: 'return', ok: true }, error: null }); });

describe('projeções de pedidos e catálogos na mutation canônica', () => {
  for (const action of ['save', 'assignTerminal', 'value', 'forward', 'cancel', 'convert'] as const) {
    it(`${action} de atendimento invalida lista, detalhe, fluxo e catálogo`, async () => {
      const ctx = setup(); const view = renderHook(usePdvPreorderActions, { wrapper: ctx.wrapper });
      const input = { preorderId: 'preorder', expectedRevision: 1, requestId: 'same-attempt',
        targetTerminalId: 'terminal', header: { stock_id: 'stock', operation_mode: 'counter' as const }, items: [] };
      await act(async () => { await view.result.current[action].mutateAsync(input); });
      ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true));
      view.unmount(); ctx.client.clear();
    });
    it(`${action} negado preserva as consultas confirmadas`, async () => {
      const ctx = setup(); const view = renderHook(usePdvPreorderActions, { wrapper: ctx.wrapper });
      rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
      const input = { preorderId: 'preorder', expectedRevision: 1, requestId: 'same-attempt',
        targetTerminalId: 'terminal', header: { stock_id: 'stock', operation_mode: 'counter' as const }, items: [] };
      await act(async () => { await expect(view.result.current[action].mutateAsync(input)).rejects.toThrow(); });
      ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated).toBe(false));
      view.unmount(); ctx.client.clear();
    });
  }
  it('reembolso confirmado depois de sair da tela ainda invalida Pedidos e Balcão', async () => {
    const ctx = setup(); let finish!: (value: unknown) => void;
    rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = renderHook(usePdvRequestRefund, { wrapper: ctx.wrapper });
    let pending!: Promise<unknown>;
    await act(async () => { pending = view.result.current.mutateAsync({ orderId: 'order', returnId: 'return', paymentId: 'payment', amount: '10.00', reason: 'Motivo fictício', accountId: 'cash', cashSessionId: 'session', attemptId: 'refund-attempt' }); });
    view.unmount();
    await act(async () => { finish({ data: { ok: true }, error: null }); await pending; });
    ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated).toBe(true));
    ctx.client.clear();
  });
  it('estornar devolução e cancelar saldo atualizam as projeções atuais', async () => {
    const ctx = setup(); const view = renderHook(() => ({ reverse: usePdvReverseReturn(), cancel: usePdvCancelResidual() }), { wrapper: ctx.wrapper });
    for (const action of ['reverse', 'cancel'] as const) {
      ctx.keys.forEach(key => ctx.client.setQueryData(key, { version: 1 }));
      await act(async () => { await view.result.current[action].mutateAsync({ orderId: 'order', returnId: 'return', reason: 'Motivo fictício', attemptId: action }); });
      ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated).toBe(true));
    }
    view.unmount(); ctx.client.clear();
  });
  it('cancelamento de venda atualiza opções e quantidade dos dois catálogos', async () => {
    const ctx = setup(); await invalidatePdvOrderCancellationCaches(ctx.client);
    ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated).toBe(true)); ctx.client.clear();
  });
  it('abertura, fechamento e reabertura atualizam opções de recebimento e configuração', async () => {
    const keys = [catalogKeys[0], ['pdv-orders', 'receiving-target', 'scope', 'company', 'operator', 'order'],
      ['pdv-cash-account-settings-v2', 'scope', 'company', 'operator']];
    const ctx = setup(keys); await invalidatePdvCashV2Caches(ctx.client);
    ctx.keys.forEach(key => expect(ctx.client.getQueryState(key)?.isInvalidated).toBe(true)); ctx.client.clear();
  });
});
