import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc, state } = vi.hoisted(() => ({ rpc: vi.fn(), state: { companyId: 'company-a', active: true } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator' }, profile: { user_id: 'operator', company_id: state.companyId, is_active: state.active }, permissions: ['screen:pdv_settings'], roles: [], hasPermissionRecord: true, loading: false, profileLoading: false }) }));
import { evaluatePdvCoupon, projectPdvCoupon, projectPdvCouponEvaluation, safePdvCouponError, usePdvCoupons, type PdvCouponRules } from './usePdvCoupons';
const ID = 'c3160000-0000-4000-8000-000000000001';
const LINE = 'c3160000-0000-4000-8000-000000000002';
const RULES: PdvCouponRules = { code: 'EXEMPLO', name: 'Exemplo', kind: 'fixed', value: 10, minimum_amount: 0, max_discount_amount: null, starts_on: null, expires_on: null, is_active: true, usage_limit: null, per_customer_limit: null, customer_ids: [], inventory_ids: [] };
const row = (name = 'Exemplo') => ({ ...RULES, id: ID, revision: 1, status: 'available', used_count: 0, name });
const list = (name = 'Exemplo') => ({ coupons: [row(name)], customers: [], inventory: [] });
const items = [{ id: LINE, inventory_id: LINE, net_cents: 1000 }];
const evaluation = () => ({ eligible: true, discount_cents: 100, coupon_id: ID, code: 'EXEMPLO', revision: 1, allocations: [{ item_id: LINE, base_net_cents: 1000, discount_cents: 100 }] });
function wrapperFor(client: QueryClient) { return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; }

describe('fronteira de cupons do PDV', () => {
  beforeEach(() => { vi.clearAllMocks(); state.companyId = 'company-a'; state.active = true; });
  it.each(['pdv_coupon_invalid', 'pdv_coupon_items_invalid', 'pdv_coupon_duplicate', 'pdv_coupon_missing', 'pdv_coupon_conflict', 'pdv_coupon_ineligible', 'pdv_coupon_order_total_zero', 'pdv_coupon_unknown'])('traduz %s sem vazar código nem mensagem interna', code => {
    const error = safePdvCouponError({ code: '22023', details: `code=${code}`, message: 'database constraint secret_table' });
    expect(error.message).not.toMatch(/pdv_|database|constraint|secret_table/);
  });
  it('preview não cria ou consome uso e envia apenas itens líquidos em centavos', async () => {
    rpc.mockResolvedValue({ data: evaluation(), error: null });
    expect(await evaluatePdvCoupon(ID, null, items)).toMatchObject({ eligible: true, discount_cents: 100 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('pdv_evaluate_coupon_v1', { p_coupon_id: ID, p_customer_id: null, p_items: items });
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, '10', -1, 1.001])('rejeita valor malformado de listagem: %s', value => {
    expect(() => projectPdvCoupon({ ...row(), value })).toThrow('Não foi possível confirmar');
  });
  it('rejeita desconto sem teto, rateio divergente, item externo, duplicado ou revisão inválida', () => {
    for (const malformed of [
      { ...evaluation(), discount_cents: 1001 }, { ...evaluation(), discount_cents: '100' }, { ...evaluation(), revision: 0 },
      { ...evaluation(), coupon_id: LINE }, { ...evaluation(), allocations: [] },
      { ...evaluation(), allocations: [{ item_id: LINE, base_net_cents: 999, discount_cents: 100 }] },
      { ...evaluation(), allocations: [{ item_id: ID, base_net_cents: 1000, discount_cents: 100 }] },
      { ...evaluation(), allocations: [...evaluation().allocations, ...evaluation().allocations] },
      { ...evaluation(), allocations: [{ item_id: LINE, base_net_cents: 1000, discount_cents: 99 }] },
    ]) expect(() => projectPdvCouponEvaluation(malformed, ID, items)).toThrow('Não foi possível confirmar');
  });
  it('bloqueia total zerado sem aceitar nem expor mensagem arbitrária do servidor', () => {
    expect(projectPdvCouponEvaluation({ eligible: false, reason: 'order_total_zero', message: 'database internal relation' }, ID, items)).toEqual({ eligible: false, reason: 'order_total_zero', message: 'O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.' });
    expect(safePdvCouponError({ details: 'code=pdv_coupon_order_total_zero', message: 'database internal relation' }).message).toBe('O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.');
    expect(() => projectPdvCouponEvaluation({ ...evaluation(), discount_cents: 1000, allocations: [{ item_id: LINE, base_net_cents: 1000, discount_cents: 1000 }] }, ID, items)).toThrow('Não foi possível confirmar');
  });
  it('permite 100% do item elegível quando outro item mantém total positivo', () => {
    const other = 'c3160000-0000-4000-8000-000000000003';
    const bases = [...items, { id: other, inventory_id: other, net_cents: 500 }];
    expect(projectPdvCouponEvaluation({ ...evaluation(), discount_cents: 1000, allocations: [{ item_id: LINE, base_net_cents: 1000, discount_cents: 1000 }] }, ID, bases)).toMatchObject({ eligible: true, discount_cents: 1000 });
  });
  it('mascara cache anterior na troca de empresa e invalida previews no salvamento', async () => {
    rpc.mockImplementation(async (name: string) => ({ data: name === 'pdv_list_coupons_v1' ? list(state.companyId) : row(), error: null }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(() => usePdvCoupons(true), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(hook.result.current.coupons[0]?.name).toBe('company-a'));
    state.companyId = 'company-b'; hook.rerender(); expect(hook.result.current.coupons).toEqual([]);
    await waitFor(() => expect(hook.result.current.coupons[0]?.name).toBe('company-b'));
    await act(() => hook.result.current.save.mutateAsync({ id: null, revision: null, rules: RULES }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv', 'coupons'] }); hook.unmount(); client.clear();
  });
  it('descarta resposta atrasada A→B→A mesmo sob keepPreviousData global', async () => {
    let finishA!: (value: unknown) => void; let finishB!: (value: unknown) => void; let calls = 0;
    rpc.mockImplementation(() => ++calls === 1 ? new Promise(resolve => { finishA = resolve; }) : calls === 2 ? new Promise(resolve => { finishB = resolve; }) : Promise.resolve({ data: list('Nova A'), error: null }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } });
    const hook = renderHook(() => usePdvCoupons(true), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(calls).toBe(1)); state.companyId = 'company-b'; hook.rerender(); await waitFor(() => expect(calls).toBe(2));
    state.companyId = 'company-a'; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(hook.result.current.coupons[0]?.name).toBe('Nova A'));
    await act(async () => { finishA({ data: list('Antiga A'), error: null }); finishB({ data: list('Antiga B'), error: null }); });
    expect(hook.result.current.coupons[0]?.name).toBe('Nova A'); hook.unmount(); client.clear();
  });
  it('perfil inativo mascara imediatamente dados e bloqueia novas chamadas', async () => {
    rpc.mockResolvedValue({ data: list(), error: null }); const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const hook = renderHook(() => usePdvCoupons(true), { wrapper: wrapperFor(client) }); await waitFor(() => expect(hook.result.current.coupons).toHaveLength(1));
    state.active = false; hook.rerender(); expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.customers).toEqual([]);
    expect(await hook.result.current.save.mutateAsync({ id: null, revision: null, rules: RULES })).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1); hook.unmount(); client.clear();
  });
  it('save após unmount ou troca de empresa não publica resultado nem invalida o novo contexto', async () => {
    for (const mode of ['unmount', 'switch'] as const) {
      let finish!: (value: unknown) => void;
      rpc.mockImplementation((name: string) => name === 'pdv_list_coupons_v1' ? Promise.resolve({ data: list(), error: null }) : new Promise(resolve => { finish = resolve; }));
      state.companyId = 'company-a'; const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const invalidate = vi.spyOn(client, 'invalidateQueries');
      const hook = renderHook(() => usePdvCoupons(true), { wrapper: wrapperFor(client) }); await waitFor(() => expect(hook.result.current.coupons).toHaveLength(1));
      let pending!: Promise<unknown>; await act(async () => { pending = hook.result.current.save.mutateAsync({ id: null, revision: null, rules: RULES }); });
      if (mode === 'unmount') hook.unmount(); else { state.companyId = 'company-b'; hook.rerender(); }
      await act(async () => { finish({ data: row(), error: null }); expect(await pending).toBeUndefined(); });
      expect(invalidate).not.toHaveBeenCalled(); if (mode !== 'unmount') hook.unmount(); client.clear();
    }
  });
});
