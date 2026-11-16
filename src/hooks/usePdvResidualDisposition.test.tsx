import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'u1' }, profile: { user_id: 'u1', company_id: 'c1', is_active: true }, permissions: ['fn:view_pdv_after_sale', 'fn:manage_party_credit'], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false },
  rpc: vi.fn(), plan: vi.fn(), write: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
import { clearPdvResidualDispositionIntentsForTests, mapPdvResidualDispositionError, projectPdvResidualDispositionPlan, usePdvResidualDisposition, validatePdvResidualDisposition } from './usePdvResidualDisposition';
const payload = () => ({ order_id: 'o1', cancellation_id: 'cancel1', customer_id: 'customer1', plan_hash: 'a'.repeat(64), free_amount: 15,
  capabilities: { customer_credit: true, voucher: true, refund: true }, payments: [
    { payment_id: 'p1', method: 'dinheiro', account_id: 'cash', budget_amount: 10, available_amount: 10 },
    { payment_id: 'p2', method: 'pix', account_id: 'bank', budget_amount: 5, available_amount: 5 }],
  cash_options: [{ session_id: 'session1', terminal_id: 'terminal1', account_id: 'cash', label: 'Caixa original' }], bank_options: [{ account_id: 'bank', label: 'Banco original' }] });
const destinations = () => [{ kind: 'customer_credit' as const, paymentId: 'p1', amountCents: 1000 }, { kind: 'voucher' as const, paymentId: 'p2', amountCents: 500 }];
function context() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } }); return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); clearPdvResidualDispositionIntentsForTests();
  mocks.auth = { user: { id: 'u1' }, profile: { user_id: 'u1', company_id: 'c1', is_active: true }, permissions: ['fn:view_pdv_after_sale', 'fn:manage_party_credit'], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false };
  mocks.plan.mockImplementation(async () => ({ data: payload(), error: null }));
  mocks.write.mockImplementation(async (args: Record<string, unknown>) => ({ data: { ok: true, order_id: 'o1', cancellation_id: 'cancel1', allocated_amount: 15,
    resources: (args.p_dispositions as Array<Record<string, unknown>>).map(r => ({ ...r, credit_entry_id: 'credit1', voucher_id: 'voucher1', refund_id: 'refund1', status: r.kind === 'refund' ? 'pending' : undefined })) }, error: null }));
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => name === 'pdv_get_residual_disposition_plan_v4' ? mocks.plan(args) : mocks.write(args));
});
async function ready() { const ctx = context(); const view = renderHook(() => usePdvResidualDisposition('o1', true), { wrapper: ctx.wrapper }); await waitFor(() => expect(view.result.current.query.data?.freeCents).toBe(1500)); return { ...view, ...ctx }; }

describe('redistribuição de valor liberado', () => {
  it('preserva orçamento e saldo por pagamento; rejeita contrato sem centavos ou capacidades', () => {
    const p = projectPdvResidualDispositionPlan(payload(), 'o1'); expect(p.payments.map(p => p.availableCents)).toEqual([1000, 500]);
    for (const broken of [{ ...payload(), free_amount: 16 }, { ...payload(), free_amount: '15.001' }, { ...payload(), order_id: 'other' }, { ...payload(), capabilities: { customer_credit: 'yes' } }, { ...payload(), payments: [...payload().payments, payload().payments[0]] }]) expect(() => projectPdvResidualDispositionPlan(broken, 'o1')).toThrow();
    expect(validatePdvResidualDisposition(p, destinations())).toBe(true);
    expect(validatePdvResidualDisposition(p, [{ kind: 'customer_credit', paymentId: 'p1', amountCents: 1500 }])).toBe(false);
    expect(validatePdvResidualDisposition(p, [{ kind: 'refund', paymentId: 'p1', amountCents: 1000, accountId: 'cash', sessionId: 'other' }, destinations()[1]])).toBe(false);
    expect(validatePdvResidualDisposition(p, [destinations()[0], { kind: 'refund', paymentId: 'p2', amountCents: 500, accountId: 'other-bank' }])).toBe(false);
  });
  it('não repete cancelamento físico e invalida todos consumidores financeiros', async () => {
    const view = await ready(); const invalidate = vi.spyOn(view.client, 'invalidateQueries');
    await act(async () => { await view.result.current.submit('Destino revisto', destinations()); });
    expect(mocks.rpc).toHaveBeenCalledWith('pdv_reallocate_residual_value_v4', expect.objectContaining({ p_order_id: 'o1', p_expected_plan_hash: 'a'.repeat(64), p_dispositions: [
      { kind: 'customer_credit', original_payment_id: 'p1', amount: '10.00' }, { kind: 'voucher', original_payment_id: 'p2', amount: '5.00' }] }));
    expect(mocks.rpc.mock.calls.some(([name]) => String(name).includes('cancel_order'))).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['party-account-v2'] }); expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv-cash-sessions-v2'] });
    for (const root of ['financial-summary', 'account-balances', 'financial-accounts', 'pdv-cofre-balance', 'pdv-cash-session-detail']) expect(invalidate).toHaveBeenCalledWith({ queryKey: [root] });
  });
  it('destino negado não invalida saldos nem permite confirmação visual de sucesso', async () => {
    const view = await ready(); const invalidate = vi.spyOn(view.client, 'invalidateQueries');
    mocks.write.mockResolvedValueOnce({ data: null, error: { code: '42501', details: 'code=pdv_redisposition_access_denied' } });
    await act(async () => { await expect(view.result.current.submit('Motivo', destinations())).rejects.toMatchObject({ kind: 'permission' }); });
    expect(invalidate).not.toHaveBeenCalled(); expect(view.result.current.uncertain).toBe(false);
  });
  it.each(['response-lost', 'malformed-response'])('trava edição após %s e repete exatamente chave/hash/payload, inclusive ao reabrir', async kind => {
    const view = await ready(); if (kind === 'response-lost') mocks.write.mockRejectedValueOnce(new Error('Failed to fetch')); else mocks.write.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await act(async () => { await expect(view.result.current.submit('Motivo original', destinations())).rejects.toMatchObject({ kind: 'unknown' }); });
    await waitFor(() => expect(view.result.current.uncertain).toBe(true)); const args = mocks.write.mock.calls[0][0];
    await expect(view.result.current.submit('Novo motivo', destinations())).rejects.toMatchObject({ kind: 'unknown' }); expect(mocks.write).toHaveBeenCalledTimes(1);
    view.unmount(); const reopened = renderHook(() => usePdvResidualDisposition('o1', true), { wrapper: view.wrapper });
    await waitFor(() => expect(reopened.result.current.uncertain).toBe(true));
    await act(async () => { await reopened.result.current.retryIntent(); }); expect(mocks.write.mock.calls[1][0]).toEqual(args);
  });
  it('bloqueia nova intenção no envio duplo antes do rerender', async () => {
    const view = await ready(); const pending = deferred<{ data: null; error: { code: string } }>(); mocks.write.mockReturnValueOnce(pending.promise);
    let sending!: Promise<unknown>; act(() => { sending = view.result.current.submit('Motivo', destinations()); });
    await expect(view.result.current.submit('Outro motivo', destinations())).rejects.toMatchObject({ kind: 'unknown' });
    await act(async () => { pending.resolve({ data: null, error: { code: '40001' } }); await expect(sending).rejects.toMatchObject({ kind: 'stale' }); });
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it('descarta consulta atrasada A→B→A com cache keepPreviousData', async () => {
    const first = deferred<{ data: unknown; error: null }>(); mocks.plan.mockReturnValueOnce(first.promise); const ctx = context(); const view = renderHook(() => usePdvResidualDisposition('o1', true), { wrapper: ctx.wrapper });
    mocks.auth.profile.company_id = 'c2'; view.rerender(); mocks.auth.profile.company_id = 'c1'; view.rerender(); await waitFor(() => expect(view.result.current.query.data).toBeDefined());
    await act(async () => { first.resolve({ data: { ...payload(), cancellation_id: 'old-cancel' }, error: null }); }); expect(view.result.current.query.data?.cancellationId).toBe('cancel1');
  });
  it.each(['inactive', 'loading', 'permissions', 'unmount'])('não confirma visualmente nem aceita nova mutação depois de %s', async change => {
    const view = await ready(); const pending = deferred<{ data: unknown; error: null }>(); mocks.write.mockReturnValueOnce(pending.promise);
    let sending!: Promise<unknown>; act(() => { sending = view.result.current.submit('Motivo', destinations()); });
    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    const monetaryKeys = ['financial-summary', 'account-balances', 'financial-accounts', 'pdv-cofre-balance', 'pdv-cash-session-detail'].map(root => [root, 'scope', 'c1', 'u1']);
    monetaryKeys.forEach(key => view.client.setQueryData(key, { amount: 120 }));
    if (change === 'inactive') mocks.auth.profile.is_active = false;
    if (change === 'loading') mocks.auth.loading = true;
    if (change === 'permissions') mocks.auth.permissions = [];
    if (change === 'unmount') view.unmount(); else { view.rerender(); expect(view.result.current.query.data).toBeUndefined(); }
    await act(async () => { pending.resolve({ data: { ok: true, order_id: 'o1', cancellation_id: 'cancel1', allocated_amount: 15, resources: destinations().map(r => ({ kind: r.kind, original_payment_id: r.paymentId, amount: r.amountCents / 100, credit_entry_id: 'c', voucher_id: 'v' })) }, error: null }); await expect(sending).rejects.toMatchObject({ kind: 'context' }); });
    monetaryKeys.forEach(key => expect(view.client.getQueryState(key)?.isInvalidated).toBe(true));
  });
  it.each(['reconciliation_required', 'cash_unavailable', 'payment_exceeded', 'total_mismatch', 'plan_changed'])('traduz domínio %s sem SQL/backend', code => {
    const result = mapPdvResidualDispositionError({ code: code === 'plan_changed' ? '40001' : '23514', details: `code=pdv_redisposition_${code}`, message: 'private_table' }); expect(result.message).not.toMatch(/private_table|pdv_|SQLSTATE/);
  });
});
