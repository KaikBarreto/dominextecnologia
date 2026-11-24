import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true }, permissions: [] as string[], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false },
  paid: true, method: 'dinheiro', paidAmount: 15, planError: null as unknown, orderError: false,
  rpc: vi.fn(), from: vi.fn(), write: vi.fn(), toast: vi.fn(), completed: vi.fn(), close: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/ui/responsive-dialog', () => ({ ResponsiveDialog: ({ open, title, description, children, footer, mobileFullHeight }: { open: boolean; title: string; description: string; children: ReactNode; footer: ReactNode; mobileFullHeight: boolean }) => open ? <div role="dialog" data-mobile-full-height={String(mobileFullHeight)}><h2>{title}</h2><p>{description}</p>{children}<footer>{footer}</footer></div> : null }));
import { clearPdvResidualIntentsForTests } from '@/hooks/usePdvReturns';
import { PdvCancelResidualDialog } from './PdvCancelResidualDialog';

const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeAll(() => Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterAll(() => { if (descriptor) Object.defineProperty(Element.prototype, 'scrollIntoView', descriptor); else Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });
const permissions = ['screen:pdv_orders', 'fn:cancel_pdv_order_residual', 'fn:manage_party_credit', 'fn:issue_pdv_voucher', 'fn:refund_pdv_return', 'fn:view_pdv_after_sale', 'fn:use_bank_accounts'];
const baseProps = () => ({ open: true, onOpenChange: mocks.close, onCompleted: mocks.completed, orderId: 'order-1', orderNumber: 90, remainingQuantity: 13 });
function show() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; return { ...render(<PdvCancelResidualDialog {...baseProps()} />, { wrapper }), wrapper }; }
async function choose(name: string, option: string | RegExp) { fireEvent.keyDown(screen.getByRole('combobox', { name }), { key: 'ArrowDown' }); fireEvent.click(await screen.findByRole('option', { name: option })); }
async function fill(kind = 'Saldo do cliente', amount = '15,00') {
  await choose('Pagamento original do destino 1', /recebido/); fireEvent.click(screen.getByRole('radio', { name: kind }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Valor do destino 1' }), { target: { value: amount } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo do cancelamento do saldo' }), { target: { value: 'Cliente desistiu do restante' } });
}
beforeEach(() => {
  vi.clearAllMocks(); clearPdvResidualIntentsForTests();
  mocks.auth = { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true }, permissions: [...permissions], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false };
  mocks.paid = true; mocks.method = 'dinheiro'; mocks.paidAmount = 15; mocks.planError = null; mocks.orderError = false;
  mocks.write.mockReset().mockImplementation(async (name: string, args: Record<string, unknown>) => ({ data: { ok: true, order_id: 'order-1', cancellation_id: 'cancellation-1', resources: name.endsWith('_v3') ? (args.p_dispositions as Array<Record<string, unknown>>).map(r => ({ ...r, status: r.kind === 'refund' ? mocks.method === 'dinheiro' ? 'settled' : 'pending' : undefined })) : [] }, error: null }));
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'pdv_get_module_features_v3') return { data: { company_id: mocks.auth.profile.company_id, module_available: true, after_sale: true }, error: null };
    if (name === 'pdv_get_order_residual_cancellation_v3') return { data: null, error: null };
    if (name === 'pdv_get_order_residual_plan_v3') return { data: { order_id: 'order-1', customer_id: 'customer-1', plan_hash: 'a'.repeat(64), order_total: 90, delivered_amount: 25, residual_amount: 65, receivable_reduction_amount: 65 - mocks.paidAmount, paid_disposition_amount: mocks.paidAmount, original_payments: mocks.paidAmount ? [{ payment_id: 'payment-1', method: mocks.method, amount: 40, account_id: 'account-1', settlement_transaction_id: 'settlement-1' }] : [], receivable_reductions: [{ payment_id: 'debt-1', receivable_transaction_id: 'receivable-1', amount: 65 - mocks.paidAmount }] }, error: mocks.planError };
    if (name === 'pdv_get_after_sale_workspace_v2') return { data: { order: { order_id: 'order-1', customer_id: 'customer-1' }, capabilities: { issue_voucher: true, request_refund: true, use_bank_accounts: true }, cash_options: [{ session_id: 'session-other', terminal_id: 'terminal-other', account_id: 'wrong', label: 'Outro operador' }, { session_id: 'session-1', terminal_id: 'terminal-1', account_id: 'account-1', label: 'Caixa original' }], account_options: [{ account_id: 'wrong', label: 'Outro banco', methods: ['pix', 'transferencia'] }, { account_id: 'account-1', label: 'Banco original', methods: ['pix', 'transferencia'] }] }, error: null };
    return mocks.write(name, args);
  });
  mocks.from.mockImplementation((table: string) => { const request = { select: () => request, eq: () => request, in: () => request, abortSignal: () => request,
    maybeSingle: async () => ({ data: mocks.orderError ? null : { id: 'order-1', company_id: mocks.auth.profile.company_id, status: 'retirada_parcial', cash_session_id: 'session-1', terminal_id: 'terminal-1', payments: mocks.paid ? [{ id: 'payment-1' }] : [] }, error: mocks.orderError ? { message: 'SQLSTATE private_table' } : null }),
  };
    if (table !== 'pdv_orders') throw new Error('Tabela inesperada'); return request; });
});

describe('cancelamento do restante para o operador', () => {
  it('explica fiado automático e exige escolha explícita antes de cancelar', async () => {
    show(); await screen.findByText('Abater do fiado · automático'); expect(screen.getByText(/R\$\s*50,00/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).toBeDisabled();
    await fill(); await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await waitFor(() => expect(mocks.completed).toHaveBeenCalledOnce()); expect(mocks.write).toHaveBeenCalledWith('pdv_cancel_order_residual_v3', expect.objectContaining({ p_dispositions: [{ kind: 'customer_credit', original_payment_id: 'payment-1', amount: '15.00' }] }));
  });
  it.each(['10,00', '14,99', '15,001', '40,00'])('não envia distribuição inexata/inválida: %s', async amount => {
    show(); await screen.findByText('Abater do fiado · automático'); await fill('Saldo do cliente', amount);
    expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).toBeDisabled(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('permite dividir saldo e voucher sem duplicar ou arredondar centavos', async () => {
    show(); await screen.findByText('Abater do fiado · automático'); await fill('Saldo do cliente', '10,00');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar destino' })); await choose('Pagamento original do destino 2', /recebido/);
    fireEvent.click(within(screen.getByLabelText('Destino 2')).getByRole('radio', { name: 'Voucher' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor do destino 2' }), { target: { value: '5,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalled()); expect(mocks.write.mock.calls[0][1].p_dispositions).toEqual([{ kind: 'customer_credit', original_payment_id: 'payment-1', amount: '10.00' }, { kind: 'voucher', original_payment_id: 'payment-1', amount: '5.00' }]);
  });
  it('cash exige caixa original explícito e não apresenta caixa de outro operador', async () => {
    show(); await screen.findByText('Abater do fiado · automático'); await fill('Reembolso');
    expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).toBeDisabled(); await choose('Caixa do reembolso 1', 'Caixa original');
    expect(screen.queryByText('Outro operador')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await waitFor(() => expect(mocks.completed).toHaveBeenCalledOnce()); expect(mocks.write.mock.calls[0][1].p_dispositions[0]).toMatchObject({ account_id: 'account-1', cash_session_id: 'session-1' });
  });
  it.each(['pix', 'transferencia'])('%s solicita pela conta original e anuncia confirmação pendente', async method => {
    mocks.method = method; show(); await screen.findByText('Abater do fiado · automático'); await fill('Reembolso');
    expect(screen.queryByRole('combobox', { name: 'Caixa do reembolso 1' })).not.toBeInTheDocument();
    await choose('Conta do reembolso 1', 'Banco original'); expect(screen.queryByText('Outro banco')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/solicitado.*aguarda confirmação/) })));
    expect(mocks.write.mock.calls[0][1].p_dispositions[0]).not.toHaveProperty('cash_session_id');
  });
  it('preserva cancelamento V2 sem tratamento financeiro para pedido sem pagamentos', async () => {
    mocks.paid = false; mocks.auth.permissions = ['screen:pdv_orders', 'fn:cancel_pdv_order_residual']; show(); await screen.findByText('Sem pagamento vinculado');
    expect(screen.queryByLabelText('Destino do valor já pago')).not.toBeInTheDocument(); fireEvent.change(screen.getByRole('textbox', { name: 'Motivo do cancelamento do saldo' }), { target: { value: 'Desistência' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledWith('pdv_cancel_order_residual_v2', expect.objectContaining({ p_reason: 'Desistência' })));
  });
  it('abatimento integral de fiado envia V3 sem destinos pagos', async () => {
    mocks.paidAmount = 0; show(); await screen.findByText(/Todo o restante será abatido/); fireEvent.change(screen.getByRole('textbox', { name: 'Motivo do cancelamento do saldo' }), { target: { value: 'Desistência' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalled()); expect(mocks.write.mock.calls[0][1].p_dispositions).toEqual([]);
  });
  it.each(['source', 'query'])('bloqueia consulta %s sem inventar fallback ou expor código', async error => {
    if (error === 'source') mocks.planError = { code: '23514', details: 'code=pdv_residual_source_unsupported', message: 'private_table' }; else mocks.orderError = true;
    show(); const alert = await screen.findByRole('alert'); expect(alert).not.toHaveTextContent(/pdv_|private_table|SQLSTATE/); expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).toBeDisabled(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('preserva chave após perda de resposta e não abre nova intenção ao editar/repetir', async () => {
    mocks.write.mockRejectedValueOnce(new Error('Failed to fetch')); show(); await screen.findByText('Abater do fiado · automático'); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
    await screen.findByText('Confira a solicitação anterior'); const args = mocks.write.mock.calls[0][1]; expect(screen.queryByRole('textbox', { name: 'Valor do destino 1' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Conferir resultado' })); await waitFor(() => expect(screen.getByRole('button', { name: 'Repetir a mesma solicitação' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Repetir a mesma solicitação' })); await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2)); expect(mocks.write.mock.calls[1][1]).toEqual(args);
  });
  it('não avisa nem executa callback depois de fechar durante envio', async () => {
    let resolve!: (v: unknown) => void; mocks.write.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    show(); await screen.findByText('Abater do fiado · automático'); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' })); await screen.findByRole('button', { name: 'Fechar' });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await act(async () => { resolve({ data: { ok: true, cancellation_id: 'id', order_id: 'order-1', resources: [{ kind: 'customer_credit', original_payment_id: 'payment-1', amount: 15 }] }, error: null }); });
    expect(mocks.toast).not.toHaveBeenCalled(); expect(mocks.completed).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledWith(false);
  });
  it('mascara formulário/valores no contexto anterior e mantém layout refluível', async () => {
    const { rerender } = show(); await screen.findByText('Abater do fiado · automático'); await fill();
    expect(screen.getByRole('dialog')).toHaveAttribute('data-mobile-full-height', 'true'); expect(screen.getByLabelText('Destino 1')).toHaveClass('space-y-3');
    mocks.auth.profileLoading = true; rerender(<PdvCancelResidualDialog {...baseProps()} />);
    expect(screen.queryByText(/R\$\s*50,00/)).not.toBeInTheDocument(); expect(screen.queryByRole('textbox', { name: 'Motivo do cancelamento do saldo' })).not.toBeInTheDocument(); expect(screen.queryByText(/Pedido #90/)).not.toBeInTheDocument();
  });
});

it('mostra registro mascarado sem valores/destinos/replay e fecha sem callback financeiro', async () => {
  const prior = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => name === 'pdv_get_order_residual_cancellation_v3'
    ? Promise.resolve({ data: { cancellation_id: 'cancel-1', order_id: 'order-1', access_masked: true, unallocated_amount: null, refunds: [], vouchers: [] }, error: null }) : prior(name, args));
  show(); await screen.findByText(/Você não tem acesso aos destinos e valores/);
  expect(screen.queryByRole('button', { name: /Confirmar cancelamento|Repetir a mesma/ })).toBeNull();
  expect(screen.queryByText(/R\$/)).toBeNull(); expect(mocks.write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar' })); expect(mocks.completed).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalledWith(false);
});
