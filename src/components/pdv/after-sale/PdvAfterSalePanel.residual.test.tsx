import type { ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'u1' }, profile: { user_id: 'u1', company_id: 'c1', is_active: true }, permissions: ['fn:view_pdv_after_sale'], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false },
  rpc: vi.fn(), confirm: vi.fn(), reverse: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('./PdvVoucherDialog', () => ({ PdvVoucherDialog: () => null }));
vi.mock('./PdvRefundDialog', () => ({ PdvRefundDialog: () => null }));
vi.mock('./PdvExchangeDialog', () => ({ PdvExchangeDialog: () => null }));
vi.mock('./PdvVoucherSearchDialog', () => ({ PdvVoucherSearchDialog: () => null }));
vi.mock('./PdvAfterSaleActionDialogs', () => ({
  PdvApplyVoucherDialog: () => null,
  PdvConfirmRefundDialog: (props: { open: boolean; refund: unknown; onCompleted: () => void }) => props.open ? <button onClick={() => { mocks.confirm(props.refund); props.onCompleted(); }}>Enviar confirmação canônica</button> : null,
  PdvReverseAfterSaleDialog: (props: { open: boolean; target: unknown }) => props.open ? <button onClick={() => mocks.reverse(props.target)}>Enviar estorno canônico</button> : null,
}));
import { PdvAfterSalePanel } from './PdvAfterSalePanel';
import { derivePdvAfterSaleAccess, usePdvAfterSaleWorkspace } from '@/hooks/usePdvAfterSale';
const access = derivePdvAfterSaleAccess({ featureEnabled: true, privileged: true, hasPermissionRecord: true, permissions: [] });
const residual = () => ({ cancellation_id: 'cancel-1', order_id: 'order-1', source_kind: 'order_residual_cancellation_v3', occurred_on: '2026-11-15', reason: 'Cliente desistiu', residual_amount: 65, unallocated_amount: 0, financial_status: 'allocated', dispositions: [{ disposition_kind: 'receivable_reduction', amount: 50 }, { disposition_kind: 'customer_credit', amount: 15 }], vouchers: [] as unknown[], refunds: [] as unknown[] });
const payload = () => ({ order: { order_id: 'order-1', order_number: 42, customer_id: 'customer1', status: 'cancelado_parcial' }, capabilities: { view: true, issue_voucher: true, request_refund: true, confirm_refund: true, reverse_refund: true, reverse_voucher: true, create_exchange: true, apply_voucher: true, search_voucher: false, use_bank_accounts: true, approve_credit: true, direct_sale_voucher: true }, cash_options: [], account_options: [{ account_id: 'bank1', label: 'Banco autorizado', methods: ['pix', 'transferencia'] }], order_candidates: [], exchange_candidates: [], returns: [], residual_cancellation: residual() });
const refund = (status = 'pending', method = 'pix') => ({ refund_id: 'refund-real', amount: 15, method, status, can_confirm: status === 'pending' && method !== 'dinheiro', can_reverse: status === 'settled', requires_confirmation_reference: method === 'pix' });
function context() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } } }); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
beforeEach(() => { vi.clearAllMocks(); mocks.auth.permissions = ['fn:view_pdv_after_sale']; mocks.auth.profile = { user_id: 'u1', company_id: 'c1', is_active: true }; mocks.auth.loading = false; mocks.rpc.mockImplementation(async () => ({ data: payload(), error: null })); });
async function panel(data = payload()) { mocks.rpc.mockResolvedValue({ data, error: null }); const onReload = vi.fn(); const view = render(<PdvAfterSalePanel orderId="order-1" access={access} onReload={onReload} />, { wrapper: context() }); await screen.findByRole('article', { name: 'Itens não retirados' }); return { ...view, onReload }; }
describe('pós-venda residual visível depois do cancelamento', () => {
  it('mantém origem separada, fiado abatido e crédito histórico sem inventar devolução', async () => {
    await panel(); expect(screen.getByText('Fiado abatido')).toBeInTheDocument(); expect(screen.getByText('Destinado ao saldo do cliente')).toBeInTheDocument(); expect(screen.getByText(/incluindo usos posteriores/)).toBeInTheDocument(); expect(screen.queryByText(/Registre uma devolução/)).toBeNull(); expect(screen.queryByText(/Devolução de/)).toBeNull();
  });
  it('permite confirmar Pix pendente usando o ID canônico após fechar o cancelamento', async () => {
    const data = payload(); data.residual_cancellation.refunds = [refund()]; const { onReload } = await panel(data);
    expect(screen.getByText('Aguardando confirmação')).toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar reembolso externo' })); fireEvent.click(screen.getByText('Enviar confirmação canônica'));
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ refundId: 'refund-real', requiresConfirmationReference: true })); expect(onReload).toHaveBeenCalledOnce(); expect(screen.queryByText('Concluído')).toBeNull();
  });
  it.each(['pix', 'transferencia', 'dinheiro'])('somente reembolso liquidado %s oferece estorno', async method => {
    const data = payload(); data.residual_cancellation.refunds = [refund('settled', method)]; await panel(data); expect(screen.queryByRole('button', { name: 'Confirmar reembolso externo' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Estornar reembolso' })); fireEvent.click(screen.getByText('Enviar estorno canônico')); expect(mocks.reverse).toHaveBeenCalledWith({ kind: 'refund', item: expect.objectContaining({ refundId: 'refund-real' }) });
  });
  it('voucher usa saldo atual e só oferece estorno se o servidor autorizar', async () => {
    const data = payload(); data.residual_cancellation.vouchers = [{ voucher_id: 'voucher-real', public_code: 'DV-TESTE', balance: 15, issued_amount: 15, status: 'active', can_reverse: true, expires_on: null }]; await panel(data); fireEvent.click(screen.getByRole('button', { name: 'Estornar voucher' })); fireEvent.click(screen.getByText('Enviar estorno canônico')); expect(mocks.reverse).toHaveBeenCalledWith({ kind: 'voucher', item: expect.objectContaining({ voucherId: 'voucher-real', balance: 15 }) });
  });
  it('consumo parcial e snapshot antigo nunca ganham elegibilidade inventada', async () => {
    const data = payload(); data.residual_cancellation.vouchers = [{ voucher_id: 'v1', public_code: 'DV-PARCIAL', balance: 10, issued_amount: 15, status: 'active', can_reverse: false, expires_on: null }, { voucher_id: 'v2', public_code: 'DV-ANTIGO', balance: 15, expires_on: null }]; data.residual_cancellation.refunds = [{ refund_id: 'r1', amount: 15, status: 'pending', method: 'pix' }]; await panel(data); expect(screen.queryByRole('button', { name: /Estornar|Confirmar reembolso/ })).toBeNull(); expect(screen.getByText(/disponibilidade para estorno ainda/)).toBeInTheDocument(); expect(screen.getByText(/ações deste reembolso ainda/)).toBeInTheDocument();
  });
  it('estorno mantém pendência financeira explícita sem redestinação fictícia', async () => {
    const data = payload(); data.residual_cancellation.unallocated_amount = 15; data.residual_cancellation.financial_status = 'pending_disposition'; data.residual_cancellation.refunds = [refund('reversed')]; await panel(data); expect(screen.getByText(/aguardando nova destinação/)).toBeInTheDocument(); expect(screen.getByText(/ainda não foi encerrada/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /Estornar|Confirmar/ })).toBeNull();
  });
  it('oferece novo destino somente ao responsável por saldos e abre a pendência real', async () => {
    mocks.auth.permissions = ['fn:view_pdv_after_sale', 'fn:manage_party_credit', 'screen:customers'];
    const data = payload(); data.residual_cancellation.unallocated_amount = 15; data.residual_cancellation.financial_status = 'pending_disposition';
    const view = await panel(data);
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === 'pdv_get_residual_disposition_plan_v4' ? {
      order_id: 'order-1', cancellation_id: 'cancel-1', customer_id: 'customer1', plan_hash: 'a'.repeat(64), free_amount: 15,
      capabilities: { customer_credit: true, voucher: false, refund: false }, payments: [{ payment_id: 'p1', method: 'dinheiro', account_id: 'cash', budget_amount: 15, available_amount: 15 }], cash_options: [], bank_options: [],
    } : data, error: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Escolher novo destino' }));
    await screen.findByText('Valor aguardando destino'); expect(screen.getByRole('heading', { name: 'Escolher novo destino' })).toBeInTheDocument();
    expect(view.onReload).not.toHaveBeenCalled(); expect(screen.getByText(/pendência ainda não foi encerrada/)).toBeInTheDocument();
  });
  it('capabilities e contas indisponíveis bloqueiam ação sem escolher banco de outro contexto', async () => {
    const data = payload(); data.residual_cancellation.refunds = [refund()]; data.account_options = []; await panel(data); expect(screen.queryByRole('button', { name: 'Confirmar reembolso externo' })).toBeNull(); expect(screen.getByText(/conta bancária autorizada/)).toBeInTheDocument();
  });
  it('troca de identidade mascara valores e fecha diálogo de recurso anterior', async () => {
    const data = payload(); data.residual_cancellation.refunds = [refund()]; const view = await panel(data); fireEvent.click(screen.getByRole('button', { name: 'Confirmar reembolso externo' })); mocks.auth.profile = { user_id: 'u1', company_id: 'c2', is_active: false }; view.rerender(<PdvAfterSalePanel orderId="order-1" access={access} onReload={view.onReload} />); expect(screen.queryByText('Enviar confirmação canônica')).toBeNull(); expect(screen.queryByText('Cliente desistiu')).toBeNull();
  });
  it('erro de consulta tem retry e nunca expõe códigos internos', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'internal_table', details: 'code=pdv_denied' } }); render(<PdvAfterSalePanel orderId="order-1" access={access} onReload={vi.fn()} />, { wrapper: context() }); await screen.findByText('Não foi possível carregar vouchers e reembolsos.'); expect(screen.queryByText(/internal_table|pdv_denied/)).toBeNull(); expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
describe('escopo da consulta de lifecycle', () => {
  it('rejeita resposta atrasada A→B→A mesmo com keepPreviousData global', async () => {
    const old = deferred<{ data: unknown; error: null }>(); mocks.rpc.mockReturnValueOnce(old.promise); const view = renderHook(() => usePdvAfterSaleWorkspace('order-1', true), { wrapper: context() });
    mocks.auth.profile = { ...mocks.auth.profile, company_id: 'c2' }; view.rerender(); mocks.auth.profile = { ...mocks.auth.profile, company_id: 'c1' }; view.rerender(); await waitFor(() => expect(view.result.current.data).toBeDefined());
    await act(async () => { old.resolve({ data: { ...payload(), order: { ...payload().order, order_number: 999 } }, error: null }); }); expect(view.result.current.data?.order.orderNumber).toBe(42);
  });
  it('mascara perfil inativo/carregando e não chama RPC', () => { mocks.auth.loading = true; const view = renderHook(() => usePdvAfterSaleWorkspace('order-1', true), { wrapper: context() }); expect(view.result.current.data).toBeUndefined(); expect(mocks.rpc).not.toHaveBeenCalled(); });
});

it('histórico mascarado não projeta zero, crédito, voucher ou reembolso nem ações', async () => {
  const data = payload(); Object.assign(data.residual_cancellation, { access_masked: true, residual_amount: null, unallocated_amount: null, financial_plan: null, financial_status: null, vouchers: [], refunds: [], dispositions: [] });
  await panel(data); expect(screen.getByText(/Você não tem acesso aos valores e destinos/)).toBeInTheDocument();
  expect(screen.queryByText(/R\$/)).toBeNull(); expect(screen.queryByText('Fiado abatido')).toBeNull(); expect(screen.queryByRole('button', { name: /Estornar|Confirmar/ })).toBeNull();
});


it('explica pedido pendente e estoque disponível quando nenhuma troca pode ser oferecida', async () => {
  mocks.rpc.mockResolvedValue({ data: { ...payload(), returns: [{ return_id: 'return-stock', occurred_on: '2026-11-16', reason: 'Devolução fictícia', returned_value: 20, allocated_value: 0, unallocated_amount: 20, reallocatable_amount: 20, available_amount: 20, allocatable_value: 20, eligible_payments: [], vouchers: [], refunds: [], exchanges: [] }] }, error: null });
  render(<PdvAfterSalePanel orderId="order-1" access={access} onReload={vi.fn()} />, { wrapper: context() });
  expect(await screen.findByText('Para usar em troca, é necessário um pedido do mesmo cliente aguardando pagamento e estoque disponível.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Usar em troca' })).toBeNull();
});
