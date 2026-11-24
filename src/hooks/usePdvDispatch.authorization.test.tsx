import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: {
    user: { id: 'user-1' } as { id: string } | null,
    profile: { company_id: 'company-1', user_id: 'user-1', is_active: true as boolean | undefined },
    roles: ['comercial'], permissions: ['screen:pdv_dispatch'], hasPermissionRecord: true,
    loading: false, profileLoading: false,
  },
  rpc: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
import { usePdvCompleteDispatch, usePdvDeliveryReceipt, usePdvDispatchHistory, usePdvDispatchOrder, usePdvDispatchQueue } from './usePdvDispatch';

function context() {
  // Garante que o hook bloqueia até configurações globais que preservam o último dado.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
function payload(marker: string) {
  return {
    queue: [{ id: marker, stock_id: 'stock-1', recipient_name: marker }],
    order: { order: { id: marker }, items: [] },
    receipt: { delivery_id: marker, order: { id: 'order-1' } },
  };
}
const readers = [
  { name: 'fila', rpc: 'pdv_list_dispatch_queue_v2', data: (marker: string) => payload(marker).queue, useRead: () => usePdvDispatchQueue(), marker: (data: unknown) => (data as Array<{ id: string }> | undefined)?.[0]?.id },
  { name: 'histórico', rpc: 'pdv_list_delivered_orders_v2', data: (marker: string) => payload(marker).queue, useRead: () => usePdvDispatchHistory(), marker: (data: unknown) => (data as Array<{ id: string }> | undefined)?.[0]?.id },
  { name: 'pedido', rpc: 'pdv_get_dispatch_order_v2', data: (marker: string) => payload(marker).order, useRead: () => usePdvDispatchOrder('same-order'), marker: (data: unknown) => (data as { order: { id: string } } | undefined)?.order.id },
  { name: 'comprovante imutável', rpc: 'pdv_get_delivery_receipt_snapshot_v2', data: (marker: string) => payload(marker).receipt, useRead: () => usePdvDeliveryReceipt('same-delivery'), marker: (data: unknown) => (data as { deliveryId: string } | undefined)?.deliveryId },
];
function deferred() {
  let resolve!: (value: { data: unknown; error: null }) => void;
  const promise = new Promise<{ data: unknown; error: null }>(done => { resolve = done; });
  return { promise, resolve };
}

describe('leituras de expedição isoladas por autorização', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth = { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true }, roles: ['comercial'], permissions: ['screen:pdv_dispatch'], hasPermissionRecord: true, loading: false, profileLoading: false };
  });

  for (const reader of readers) {
    describe(reader.name, () => {
      it.each(['empresa', 'usuário', 'permissões', 'papéis'] as const)('isola o mesmo ID ao mudar %s, sem usar placeholder global', async change => {
        const next = deferred();
        state.rpc.mockResolvedValueOnce({ data: reader.data('anterior'), error: null }).mockReturnValueOnce(next.promise);
        const { client, wrapper } = context();
        const { result, rerender } = renderHook(() => reader.useRead(), { wrapper });
        await waitFor(() => expect(reader.marker(result.current.data)).toBe('anterior'));
        if (change === 'empresa') state.auth.profile.company_id = 'company-2';
        if (change === 'usuário') { state.auth.user = { id: 'user-2' }; state.auth.profile.user_id = 'user-2'; }
        if (change === 'permissões') state.auth.permissions = ['screen:pdv_dispatch', 'fn:deliver_pdv_order'];
        if (change === 'papéis') state.auth.roles = ['estoque'];
        rerender();
        expect(result.current.data).toBeUndefined();
        await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(2));
        await act(async () => { next.resolve({ data: reader.data('atual'), error: null }); });
        await waitFor(() => expect(reader.marker(result.current.data)).toBe('atual'));
        expect(state.rpc.mock.calls.map(args => args[0])).toEqual([reader.rpc, reader.rpc]);
        client.clear();
      });

      it.each(['loading', 'profileLoading', 'inativo', 'atividade desconhecida', 'perfil de outro usuário', 'sem permissão', 'sem registro explícito', 'sem sessão', 'sem empresa'] as const)('mascara no mesmo render e bloqueia consulta/refetch: %s', async phase => {
        state.rpc.mockResolvedValue({ data: reader.data('restrito'), error: null });
        const { client, wrapper } = context();
        const { result, rerender } = renderHook(() => reader.useRead(), { wrapper });
        await waitFor(() => expect(reader.marker(result.current.data)).toBe('restrito'));
        if (phase === 'loading' || phase === 'profileLoading') state.auth[phase] = true;
        if (phase === 'inativo') state.auth.profile.is_active = false;
        if (phase === 'atividade desconhecida') state.auth.profile.is_active = undefined;
        if (phase === 'perfil de outro usuário') state.auth.profile.user_id = 'outro';
        if (phase === 'sem permissão') state.auth.permissions = [];
        if (phase === 'sem registro explícito') state.auth.hasPermissionRecord = false;
        if (phase === 'sem sessão') state.auth.user = null;
        if (phase === 'sem empresa') state.auth.profile.company_id = '';
        rerender();
        expect(result.current.data).toBeUndefined();
        await act(async () => { await result.current.refetch(); });
        expect(result.current.data).toBeUndefined();
        expect(state.rpc).toHaveBeenCalledTimes(1);
        client.clear();
      });

      it('descarta retorno antigo em A→B→A mesmo quando transporte ignora cancelamento', async () => {
        const old = deferred(), current = deferred();
        const signals: AbortSignal[] = [];
        const oldRequest = Object.assign(old.promise, { abortSignal: (signal: AbortSignal) => { signals.push(signal); return oldRequest; } });
        state.rpc.mockReturnValueOnce(oldRequest).mockResolvedValueOnce({ data: reader.data('empresa-B'), error: null }).mockReturnValueOnce(current.promise);
        const { client, wrapper } = context();
        const { result, rerender } = renderHook(() => reader.useRead(), { wrapper });
        await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(1));
        state.auth.profile.company_id = 'company-B'; rerender();
        expect(result.current.data).toBeUndefined();
        await waitFor(() => expect(reader.marker(result.current.data)).toBe('empresa-B'));
        expect(signals[0]?.aborted).toBe(true);
        state.auth.profile.company_id = 'company-1'; rerender();
        expect(result.current.data).toBeUndefined();
        await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(3));
        await act(async () => { old.resolve({ data: reader.data('A-antigo'), error: null }); });
        expect(result.current.data).toBeUndefined();
        await act(async () => { current.resolve({ data: reader.data('A-confirmado'), error: null }); });
        await waitFor(() => expect(reader.marker(result.current.data)).toBe('A-confirmado'));
        expect(client.getQueryCache().getAll().some(query => reader.marker(query.state.data) === 'A-antigo')).toBe(false);
        client.clear();
      });
    });
  }

  it.each(['admin', 'gestor', 'super_admin'])('preserva leitura do papel privilegiado %s sem registro explícito', async role => {
    state.auth.roles = [role]; state.auth.permissions = []; state.auth.hasPermissionRecord = false;
    state.rpc.mockResolvedValue({ data: payload('permitido').queue, error: null });
    const { client, wrapper } = context();
    const { result } = renderHook(() => usePdvDispatchQueue(), { wrapper });
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('permitido'));
    client.clear();
  });

  it('não consulta detalhe/comprovante sem entidade mesmo com identidade confirmada', async () => {
    const { client, wrapper } = context();
    const { result } = renderHook(() => ({ order: usePdvDispatchOrder(null), receipt: usePdvDeliveryReceipt(null) }), { wrapper });
    await act(async () => { await result.current.order.refetch(); await result.current.receipt.refetch(); });
    expect(state.rpc).not.toHaveBeenCalled();
    client.clear();
  });

  it('mantém invalidação canônica por prefixo para todas as chaves autorizadas', async () => {
    state.rpc.mockResolvedValue({ data: { delivery_id: 'delivery-1' }, error: null });
    const { client, wrapper } = context();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => usePdvCompleteDispatch(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ orderId: 'same-order', lines: [], attemptId: 'attempt-1' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-dispatch', 'queue'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-dispatch', 'order', 'same-order'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-orders'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] });
    client.clear();
  });
});
