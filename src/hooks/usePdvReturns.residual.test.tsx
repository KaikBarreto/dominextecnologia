import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'user-A' }, profile: { user_id: 'user-A', company_id: 'company-A', is_active: true }, permissions: [] as string[], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false },
  rpc: vi.fn(), from: vi.fn(), order: vi.fn(), features: vi.fn(), write: vi.fn(), plan: vi.fn(), cancellation: vi.fn(), options: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
import { buildPdvResidualRpcArgs, clearPdvResidualIntentsForTests, mapPdvResidualError, projectPdvResidualPlan, usePdvResidualCancellation, validatePdvResidualDestinations, type PdvResidualWorkspace } from './usePdvReturns';

const hash = 'a'.repeat(64);
const plan = () => ({ order_id: 'order-1', customer_id: 'customer-1', plan_hash: hash, order_total: 90, delivered_amount: 25, residual_amount: 65, receivable_reduction_amount: 50, paid_disposition_amount: 15,
  original_payments: [{ payment_id: 'cash-1', method: 'dinheiro', amount: 40, account_id: 'account-1', settlement_transaction_id: 'settlement-1' }], receivable_reductions: [{ payment_id: 'debt-1', receivable_transaction_id: 'receivable-1', amount: 50 }] });
const order = (paid = true) => ({ id: 'order-1', company_id: mocks.auth.profile.company_id, status: 'retirada_parcial', cash_session_id: 'session-1', terminal_id: 'terminal-1', payments: paid ? [{ id: 'cash-1' }, { id: 'debt-1' }] : [] });
const options = () => ({ order: { order_id: 'order-1', customer_id: 'customer-1' }, capabilities: { issue_voucher: true, request_refund: true, use_bank_accounts: true }, cash_options: [{ session_id: 'session-other', terminal_id: 'terminal-other', account_id: 'account-other', label: 'Outro caixa' }, { session_id: 'session-1', terminal_id: 'terminal-1', account_id: 'account-1', label: 'Caixa original' }], account_options: [] });
const destination = { kind: 'customer_credit' as const, paymentId: 'cash-1', amountCents: 1500 };
function context() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData }, mutations: { retry: false } } }); return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const permissions = ['screen:pdv_orders', 'fn:cancel_pdv_order_residual', 'fn:manage_party_credit', 'fn:issue_pdv_voucher', 'fn:refund_pdv_return', 'fn:view_pdv_after_sale', 'fn:use_bank_accounts'];

beforeEach(() => {
  vi.clearAllMocks(); clearPdvResidualIntentsForTests();
  mocks.auth = { user: { id: 'user-A' }, profile: { user_id: 'user-A', company_id: 'company-A', is_active: true }, permissions: [...permissions], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false };
  mocks.order.mockReset().mockImplementation(async () => ({ data: order(), error: null }));
  mocks.features.mockReset().mockResolvedValue({ data: { company_id: 'company-A', module_available: true, after_sale: true }, error: null });
  mocks.plan.mockReset().mockImplementation(async () => ({ data: plan(), error: null }));
  mocks.cancellation.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.options.mockReset().mockImplementation(async () => ({ data: options(), error: null }));
  mocks.write.mockReset().mockImplementation(async (_name: string, args: Record<string, unknown>) => ({ data: { ok: true, cancellation_id: 'cancellation-1', order_id: 'order-1', resources: (args.p_dispositions as Array<Record<string, unknown>> ?? []).map(r => ({ ...r, amount: r.amount })) }, error: null }));
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => name === 'pdv_get_module_features_v3' ? mocks.features(args) : name === 'pdv_get_order_residual_cancellation_v3' ? mocks.cancellation(args) : name === 'pdv_get_order_residual_plan_v3' ? mocks.plan(args) : name === 'pdv_get_after_sale_workspace_v2' ? mocks.options(args) : mocks.write(name, args));
  mocks.from.mockImplementation((table: string) => { const request = { select: () => request, eq: () => request, abortSignal: () => request, maybeSingle: () => mocks.order() }; if (table !== 'pdv_orders') throw new Error('Tabela inesperada'); return request; });
});

async function ready() { const ctx = context(); const hook = renderHook(() => usePdvResidualCancellation('order-1', true), { wrapper: ctx.wrapper }); await waitFor(() => expect(hook.result.current.query.data?.mode).toBe('covered')); return { ...hook, ...ctx }; }

describe('contrato monetário do restante', () => {
  it('valida soma do plano, proveniência suportada, tipos e centavos', () => {
    const p = projectPdvResidualPlan(plan(), 'order-1'); expect(p).toMatchObject({ reductionCents: 5000, paidCents: 1500, residualCents: 6500 });
    for (const broken of [{ ...plan(), paid_disposition_amount: 16 }, { ...plan(), plan_hash: null }, { ...plan(), residual_amount: '65.001' }, { ...plan(), original_payments: [{ ...plan().original_payments[0], method: 'saldo_cliente' }] }]) expect(() => projectPdvResidualPlan(broken, 'order-1')).toThrow();
    const workspace: Extract<PdvResidualWorkspace, { mode: 'covered' }> = { mode: 'covered', plan: p, canCredit: true, canVoucher: true, canRefund: true, cash: [{ id: 's', accountId: 'a', label: 'Caixa' }], banks: [], optionsWarning: false };
    expect(validatePdvResidualDestinations(workspace, [destination])).toBe(true);
    expect(validatePdvResidualDestinations(workspace, [{ ...destination, amountCents: 1499 }])).toBe(false);
    expect(validatePdvResidualDestinations(workspace, [{ ...destination, kind: 'refund', accountId: 'wrong', sessionId: 's' }])).toBe(false);
    expect(buildPdvResidualRpcArgs({ orderId: 'order-1', reason: ' Motivo ', destinations: [destination], planHash: hash, attemptId: 'key' })).toMatchObject({ p_reason: 'Motivo', p_dispositions: [{ kind: 'customer_credit', original_payment_id: 'cash-1', amount: '15.00' }], p_expected_plan_hash: hash, p_idempotency_key: 'key' });
  });
  it.each(['source_unsupported', 'receivable_unsupported', 'settlement_unsupported', 'customer_required', 'payload_invalid', 'payment_mismatch', 'plan_changed', 'coverage_mismatch', 'stock_denied', 'cash_insufficient', 'reconciliation_required'])('mapeia a família %s sem detalhes internos', code => {
    const error = mapPdvResidualError({ code: '23514', details: 'code=pdv_residual_' + code, message: 'SQLSTATE private_table backend' });
    expect(error.message).not.toMatch(/SQLSTATE|private_table|pdv_|backend/); expect(error.message.length).toBeGreaterThan(20);
  });
});

describe('leitura e intenção autorizadas', () => {
  it('respeita o plano e a disponibilidade canônicos sem consultar flags legadas', async () => {
    const { result } = await ready();
    expect(result.current.query.data).toMatchObject({ canCredit: true, canVoucher: true });
    expect(mocks.rpc).toHaveBeenCalledWith('pdv_get_module_features_v3', {});
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('mantém vouchers e reembolsos bloqueados quando a capacidade canônica está indisponível', async () => {
    mocks.features.mockResolvedValue({ data: { company_id: 'company-A', module_available: false, after_sale: false }, error: null });
    const { result } = await ready();
    expect(result.current.query.data).toMatchObject({ canCredit: true, canVoucher: false, canRefund: false, cash: [], banks: [] });
    expect(mocks.options).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    await act(async () => { await result.current.submit('Restante não retirado', [destination]); });
    expect(mocks.write).toHaveBeenCalledWith('pdv_cancel_order_residual_v3', expect.objectContaining({
      p_expected_plan_hash: hash,
      p_dispositions: [{ kind: 'customer_credit', original_payment_id: 'cash-1', amount: '15.00' }],
    }));
  });
  it('fecha o acesso quando o servidor recusa o plano, sem fallback nem escrita', async () => {
    mocks.plan.mockResolvedValue({ data: null, error: { code: '42501', details: 'code=pdv_residual_access_denied' } });
    const { wrapper } = context();
    const { result } = renderHook(() => usePdvResidualCancellation('order-1', true), { wrapper });
    await waitFor(() => expect(result.current.query.isError).toBe(true));
    expect(result.current.query.data).toBeUndefined();
    expect(result.current.query.error).toMatchObject({ kind: 'permission' });
    expect(mocks.features).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('preserva V2 para pedido comprovadamente sem pagamentos e sem manage_party_credit', async () => {
    mocks.auth.permissions = ['screen:pdv_orders', 'fn:cancel_pdv_order_residual']; mocks.order.mockImplementation(async () => ({ data: order(false), error: null }));
    const { wrapper } = context(); const { result } = renderHook(() => usePdvResidualCancellation('order-1', true), { wrapper });
    await waitFor(() => expect(result.current.query.data?.mode).toBe('unpaid'));
    await act(async () => { await result.current.submit('Sem retirada'); });
    expect(mocks.write).toHaveBeenCalledWith('pdv_cancel_order_residual_v2', expect.objectContaining({ p_order_id: 'order-1', p_reason: 'Sem retirada', p_idempotency_key: expect.any(String) })); expect(mocks.plan).not.toHaveBeenCalled();
  });
  it('recusa coberto sem permissão financeira e nunca tenta fallback V2', async () => {
    mocks.auth.permissions = ['screen:pdv_orders', 'fn:cancel_pdv_order_residual'];
    const { wrapper } = context(); const { result } = renderHook(() => usePdvResidualCancellation('order-1', true), { wrapper });
    await waitFor(() => expect(result.current.query.isError).toBe(true)); expect(mocks.write).not.toHaveBeenCalled(); expect(result.current.query.data).toBeUndefined();
  });
  it('usa apenas o caixa original e invalida consumidores canônicos', async () => {
    const { result, client } = await ready(); const invalidate = vi.spyOn(client, 'invalidateQueries');
    expect(result.current.query.data).toMatchObject({ cash: [{ id: 'session-1', accountId: 'account-1' }] });
    await act(async () => { await result.current.submit('Desistência', [destination]); });
    expect(mocks.write).toHaveBeenCalledWith('pdv_cancel_order_residual_v3', expect.objectContaining({ p_expected_plan_hash: hash }));
    for (const root of ['pdv-returns', 'pdv-orders', 'inventory', 'party-account', 'pdv-customer-credit', 'pdv-customer-payment-options', 'pdv-cash-sessions-v2']) expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: [root] }));
  });
  it('congela intenção incerta e repete só a mesma chave/payload após consultar', async () => {
    mocks.write.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { result } = await ready();
    await act(async () => { await expect(result.current.submit('Desistência', [destination])).rejects.toMatchObject({ kind: 'unknown' }); });
    const original = mocks.write.mock.calls[0][1];
    await act(async () => { await expect(result.current.submit('Outro motivo', [destination])).rejects.toMatchObject({ kind: 'pending' }); await result.current.reconcile(); });
    expect(mocks.write).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.retryIntent(); });
    expect(mocks.write.mock.calls[1][1]).toEqual(original);
  });
  it('permite novo plano após recusa explícita, com chave nova e sem fallback', async () => {
    mocks.write.mockResolvedValueOnce({ data: null, error: { code: '40001', details: 'code=pdv_residual_plan_changed' } });
    const { result } = await ready();
    await act(async () => { await expect(result.current.submit('Desistência', [destination])).rejects.toMatchObject({ kind: 'stale' }); });
    const original = mocks.write.mock.calls[0][1]; mocks.plan.mockImplementation(async () => ({ data: { ...plan(), plan_hash: 'b'.repeat(64) }, error: null }));
    await act(async () => { await result.current.reconcile(); });
    await waitFor(() => expect(result.current.query.data).toMatchObject({ plan: { hash: 'b'.repeat(64) } }));
    await act(async () => { await result.current.submit('Desistência', [destination]); });
    expect(mocks.write.mock.calls[1][1].p_idempotency_key).not.toBe(original.p_idempotency_key); expect(mocks.write.mock.calls[1][1].p_expected_plan_hash).toBe('b'.repeat(64));
  });
  it('rejeita confirmação financeira incompleta como resultado incerto', async () => {
    mocks.write.mockResolvedValue({ data: { ok: true, order_id: 'order-1', cancellation_id: 'id', resources: [{ kind: 'refund', amount: null }] }, error: null });
    const { result } = await ready(); await act(async () => { await expect(result.current.submit('Desistência', [destination])).rejects.toMatchObject({ kind: 'unknown' }); }); await waitFor(() => expect(result.current.uncertain).toBe(true));
  });
  it('esconde imediatamente contexto anterior, inclusive A→B→A com resposta tardia', async () => {
    const first = deferred<{ data: ReturnType<typeof plan>; error: null }>(); mocks.plan.mockImplementationOnce(() => first.promise);
    const { wrapper } = context(); const { result, rerender } = renderHook(() => usePdvResidualCancellation('order-1', true), { wrapper });
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledOnce());
    mocks.auth.profile.company_id = 'company-B'; rerender(); expect(result.current.query.data).toBeUndefined();
    await waitFor(() => expect(result.current.query.data?.mode).toBe('covered'));
    mocks.auth.profile.company_id = 'company-A'; rerender(); expect(result.current.query.data).toBeUndefined();
    await waitFor(() => expect(result.current.query.data?.mode).toBe('covered'));
    await act(async () => { first.resolve({ data: { ...plan(), residual_amount: 999 }, error: null }); });
    expect(result.current.query.data).toMatchObject({ plan: { residualCents: 6500 } });
    mocks.auth.profile.is_active = false; rerender(); expect(result.current.query.data).toBeUndefined();
  });
  it('não entrega retorno de mutation após fechar, trocar identidade e retornar', async () => {
    const pending = deferred<unknown>(); mocks.write.mockImplementationOnce(() => pending.promise);
    const { result, rerender } = await ready(); let outcome: Promise<unknown>;
    await act(async () => { outcome = result.current.submit('Desistência', [destination]).catch(e => e); });
    mocks.auth.profile.company_id = 'company-B'; rerender(); mocks.auth.profile.company_id = 'company-A'; rerender();
    await act(async () => { pending.resolve({ data: { ok: true, order_id: 'order-1', cancellation_id: 'id', resources: [{ kind: 'customer_credit', original_payment_id: 'cash-1', amount: 15 }] }, error: null }); expect(await outcome).toMatchObject({ kind: 'context' }); });
  });
  it('fecha em erro de leitura sem exibir erro técnico nem inventar dados', async () => {
    mocks.order.mockRejectedValue(new Error('private_table SQLSTATE 42P01'));
    const { wrapper } = context(); const { result } = renderHook(() => usePdvResidualCancellation('order-1', true), { wrapper });
    await waitFor(() => expect(result.current.query.isError).toBe(true)); expect(result.current.query.error?.message).not.toMatch(/private_table|SQLSTATE/); expect(result.current.query.data).toBeUndefined(); expect(mocks.write).not.toHaveBeenCalled();
  });
});

describe('recuperação mascarada de cancelamento persistido', () => {
  it('não consulta plano financeiro nem oferece replay para registro sem view', async () => {
    mocks.cancellation.mockResolvedValue({ data: { cancellation_id: 'cancel-1', order_id: 'order-1', access_masked: true, residual_amount: null, unallocated_amount: null, financial_plan: null, refunds: [], vouchers: [] }, error: null });
    mocks.auth.permissions = ['screen:pdv_orders', 'fn:cancel_pdv_order_residual'];
    const { wrapper } = context(); const { result } = renderHook(() => usePdvResidualCancellation('order-1', true), { wrapper });
    await waitFor(() => expect(result.current.query.data?.mode).toBe('completed'));
    expect(result.current.query.data).toMatchObject({ summary: { accessMasked: true, unallocatedCents: null, pendingRefund: null } });
    expect(mocks.plan).not.toHaveBeenCalled();
    await act(async () => { await expect(result.current.retryIntent()).rejects.toMatchObject({ kind: 'pending' }); });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('intenção com resposta perdida não é repetida depois de reconciliar registro mascarado', async () => {
    mocks.write.mockRejectedValueOnce(new Error('Failed to fetch')); const { result } = await ready();
    await act(async () => { await expect(result.current.submit('Desistência', [destination])).rejects.toMatchObject({ kind: 'unknown' }); });
    mocks.cancellation.mockResolvedValue({ data: { cancellation_id: 'cancel-1', order_id: 'order-1', access_masked: true, unallocated_amount: null, refunds: [] }, error: null });
    await act(async () => { await result.current.reconcile(); });
    await waitFor(() => expect(result.current.query.data?.mode).toBe('completed'));
    await act(async () => { await expect(result.current.retryIntent()).rejects.toMatchObject({ kind: 'pending' }); });
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
});
