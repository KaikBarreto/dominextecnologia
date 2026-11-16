import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc, auth } = vi.hoisted(() => ({ rpc: vi.fn(), auth: { company: 'a' } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator' }, profile: { user_id: 'operator', company_id: auth.company, is_active: true }, permissions: ['screen:pdv'], roles: [], hasPermissionRecord: true, loading: false, profileLoading: false }) }));
import { projectPdvPendingOrderCoupon, usePdvPendingOrderCoupon } from './usePdvPendingOrderCoupon';
const ORDER = 'c3160000-0000-4000-8000-000000000001', ITEM = 'c3160000-0000-4000-8000-000000000002', COUPON = 'c3160000-0000-4000-8000-000000000003';
const context = { orderId: ORDER, terminalId: 'terminal', cashSessionId: 'session', cashAccountId: 'cash' };
const snapshot = () => ({ order_id: ORDER, revision: 0, customer_id: null, total: 70, coupon_id: COUPON, coupon_code: 'EXEMPLO', discount_cents: 2000, items: [{ id: ITEM, inventory_id: ITEM, net_cents: 9000 }] });
function wrapperFor(client: QueryClient) { return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
describe('cupom de pedido pendente', () => {
  beforeEach(() => { vi.clearAllMocks(); auth.company = 'a'; });
  it('valida composição total e mantém preço após desconto manual ao remover promoção', () => {
    expect(projectPdvPendingOrderCoupon(snapshot(), ORDER)).toMatchObject({ total: 70, discountCents: 2000 });
    expect(projectPdvPendingOrderCoupon({ ...snapshot(), total: 90, coupon_id: null, coupon_code: null, discount_cents: 0 }, ORDER)).toMatchObject({ total: 90, couponId: null });
    for (const raw of [{ ...snapshot(), total: 90 }, { ...snapshot(), discount_cents: '2000' }, { ...snapshot(), revision: -1 }, { ...snapshot(), items: [...snapshot().items, ...snapshot().items] }, { ...snapshot(), order_id: ITEM }]) expect(() => projectPdvPendingOrderCoupon(raw, ORDER)).toThrow('Não foi possível confirmar');
  });
  it('envia revisão confirmada e invalida fila, pedidos, fluxo e comprovantes antes do retorno', async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === 'pdv_set_pending_order_coupon_v1' ? { ...snapshot(), revision: 1, total: 90, coupon_id: null, coupon_code: null, discount_cents: 0 } : snapshot(), error: null }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => usePdvPendingOrderCoupon(context), { wrapper: wrapperFor(client) }); await waitFor(() => expect(hook.result.current.data?.total).toBe(70));
    await act(async () => { const result = await hook.result.current.save.mutateAsync({ couponId: null, discountCents: 0, revision: 0 }); expect(result?.total).toBe(90); });
    expect(rpc).toHaveBeenCalledWith('pdv_set_pending_order_coupon_v1', { p_order_id: ORDER, p_terminal_id: 'terminal', p_cash_session_id: 'session', p_cash_account_id: 'cash', p_coupon_id: null, p_expected_discount_cents: 0, p_expected_revision: 0 });
    for (const queryKey of [['pdv-counter', 'cash-queue'], ['pdv', 'orders-workspace'], ['pdv-sales-flow'], ['pdv-order-receipt']]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
    hook.unmount(); client.clear();
  });
  it('descarta consulta atrasada e mascara dados ao trocar empresa sob keepPreviousData', async () => {
    let finish!: (value: unknown) => void; let count = 0;
    rpc.mockImplementation(() => ++count === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ data: { ...snapshot(), total: 90, coupon_id: null, coupon_code: null, discount_cents: 0 }, error: null }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } }); const hook = renderHook(() => usePdvPendingOrderCoupon(context), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(count).toBe(1)); auth.company = 'b'; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(hook.result.current.data?.total).toBe(90)); await act(async () => { finish({ data: snapshot(), error: null }); }); expect(hook.result.current.data?.total).toBe(90);
    hook.unmount(); client.clear();
  });
});
