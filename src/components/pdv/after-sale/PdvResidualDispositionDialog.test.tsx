import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'u1' }, profile: { user_id: 'u1', company_id: 'c1', is_active: true }, permissions: ['fn:view_pdv_after_sale', 'fn:manage_party_credit'], roles: ['comercial'], hasPermissionRecord: true, loading: false, profileLoading: false },
  rpc: vi.fn(), write: vi.fn(), toast: vi.fn(), complete: vi.fn(), close: vi.fn(), available: 15, canCredit: true, cashOpen: true, bankMethod: false,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/ui/responsive-dialog', () => ({ ResponsiveDialog: ({ open, title, children, footer }: { open: boolean; title: string; children: ReactNode; footer: ReactNode }) => open ? <div role="dialog"><h2>{title}</h2>{children}<footer>{footer}</footer></div> : null }));
import { clearPdvResidualDispositionIntentsForTests } from '@/hooks/usePdvResidualDisposition';
import { PdvResidualDispositionDialog } from './PdvResidualDispositionDialog';
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeAll(() => Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterAll(() => { if (scrollDescriptor) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollDescriptor); else Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });
function payload() { return { order_id: 'o1', cancellation_id: 'cancel1', customer_id: 'customer1', plan_hash: 'a'.repeat(64), free_amount: mocks.available,
  capabilities: { customer_credit: mocks.canCredit, voucher: true, refund: true }, payments: [{ payment_id: 'p1', method: mocks.bankMethod ? 'pix' : 'dinheiro', account_id: mocks.bankMethod ? 'bank' : 'cash', budget_amount: 15, available_amount: mocks.available }],
  cash_options: mocks.cashOpen ? [{ session_id: 'session1', terminal_id: 'terminal1', account_id: 'cash', label: 'Caixa original' }] : [], bank_options: [{ account_id: 'bank', label: 'Banco original' }, { account_id: 'other-bank', label: 'Outro banco' }] }; }
function show() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const props = { open: true, onOpenChange: mocks.close, orderId: 'o1', onCompleted: mocks.complete, isCurrent: () => true }; const view = render(<PdvResidualDispositionDialog {...props} />, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }); return { ...view, props }; }
async function choose(name: string, value: string | RegExp) { fireEvent.click(screen.getByRole('combobox', { name })); fireEvent.click(await screen.findByRole('option', { name: value })); }
async function fill(kind = 'Saldo do cliente', amount = '15,00') { await choose('Pagamento original 1', /disponível/); fireEvent.click(screen.getByRole('radio', { name: kind })); fireEvent.change(screen.getByRole('textbox', { name: 'Valor do novo destino 1' }), { target: { value: amount } }); fireEvent.change(screen.getByRole('textbox', { name: 'Motivo da nova destinação' }), { target: { value: 'Destino revisto com cliente' } }); }
beforeEach(() => {
  vi.clearAllMocks(); clearPdvResidualDispositionIntentsForTests(); mocks.available = 15; mocks.canCredit = true; mocks.cashOpen = true; mocks.bankMethod = false;
  mocks.auth.profile = { user_id: 'u1', company_id: 'c1', is_active: true }; mocks.auth.permissions = ['fn:view_pdv_after_sale', 'fn:manage_party_credit'];
  mocks.write.mockImplementation(async (args: Record<string, unknown>) => ({ data: { ok: true, order_id: 'o1', cancellation_id: 'cancel1', allocated_amount: 15, resources: (args.p_dispositions as Array<Record<string, unknown>>).map(r => ({ ...r, credit_entry_id: 'credit', voucher_id: 'voucher', refund_id: 'refund', status: r.kind === 'refund' ? mocks.bankMethod ? 'pending' : 'settled' : undefined })) }, error: null }));
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === 'pdv_get_residual_disposition_plan_v4' ? { data: payload(), error: null } : mocks.write(args));
});
describe('novo destino residual explícito', () => {
  it('explica o valor livre, exige origem/destino/valor/motivo e não recancela itens', async () => {
    show(); await screen.findByText('Valor aguardando destino'); expect(screen.getByRole('button', { name: 'Confirmar novo destino' })).toBeDisabled();
    expect(screen.getByText(/fiado já abatido e os itens cancelados permanecem/)).toBeInTheDocument(); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar novo destino' }));
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce()); expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ p_dispositions: [{ kind: 'customer_credit', original_payment_id: 'p1', amount: '15.00' }] }));
    expect(mocks.rpc.mock.calls.some(([name]) => String(name).includes('cancel_order'))).toBe(false);
  });
  it.each(['14,99', '15,001', '20,00'])('recusa soma/centavos inválidos %s', async amount => { show(); await screen.findByText('Valor aguardando destino'); await fill('Saldo do cliente', amount); expect(screen.getByRole('button', { name: 'Confirmar novo destino' })).toBeDisabled(); expect(mocks.write).not.toHaveBeenCalled(); });
  it('exige confirmação do caixa original e não preenche destino sozinho', async () => {
    show(); await screen.findByText('Valor aguardando destino'); await fill('Reembolso'); expect(screen.getByRole('button', { name: 'Confirmar novo destino' })).toBeDisabled();
    await choose('Caixa original 1', 'Caixa original'); fireEvent.click(screen.getByRole('button', { name: 'Confirmar novo destino' })); await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0][0].p_dispositions[0]).toMatchObject({ account_id: 'cash', cash_session_id: 'session1' });
  });
  it('mantém banco pendente e mostra somente a conta do pagamento original', async () => {
    mocks.bankMethod = true; show(); await screen.findByText('Valor aguardando destino'); await fill('Reembolso'); fireEvent.click(screen.getByRole('combobox', { name: 'Conta original 1' }));
    expect(screen.queryByRole('option', { name: 'Outro banco' })).toBeNull(); fireEvent.click(await screen.findByRole('option', { name: 'Banco original' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar novo destino' })); await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringMatching(/aguarda confirmação/) })));
  });
  it('caixa original fechado informa limitação e não oferece reembolso dinheiro', async () => {
    mocks.cashOpen = false; show(); await screen.findByText('Valor aguardando destino'); await choose('Pagamento original 1', /disponível/);
    expect(screen.queryByRole('radio', { name: 'Reembolso' })).toBeNull(); expect(screen.getByText(/caixa original está fechado/)).toBeInTheDocument();
  });
  it('pode dividir saldo e voucher sem reaplicar fiado', async () => {
    show(); await screen.findByText('Valor aguardando destino'); await fill('Saldo do cliente', '10,00'); fireEvent.click(screen.getByRole('button', { name: 'Adicionar destino' }));
    await choose('Pagamento original 2', /disponível/); fireEvent.click(within(screen.getByLabelText('Novo destino 2')).getByRole('radio', { name: 'Voucher' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Valor do novo destino 2' }), { target: { value: '5,00' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirmar novo destino' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalled()); expect(mocks.write.mock.calls[0][0].p_dispositions).toHaveLength(2);
  });
  it('perda de resposta trava edição e permite só replay literal', async () => {
    mocks.write.mockRejectedValueOnce(new Error('Failed to fetch')); show(); await screen.findByText('Valor aguardando destino'); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar novo destino' }));
    await screen.findByText('Confira a solicitação anterior'); const args = mocks.write.mock.calls[0][0]; expect(screen.queryByRole('textbox', { name: 'Valor do novo destino 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Repetir a mesma solicitação' })); await waitFor(() => expect(mocks.complete).toHaveBeenCalled()); expect(mocks.write.mock.calls[1][0]).toEqual(args);
  });
  it('F9 não alcança o editor de orçamento enquanto o diálogo está aberto', async () => {
    const parent = vi.fn(); window.addEventListener('keydown', parent); const view = show(); await screen.findByText('Valor aguardando destino');
    fireEvent.keyDown(window, { key: 'F9' }); expect(parent).not.toHaveBeenCalled(); view.unmount(); window.removeEventListener('keydown', parent);
  });
  it('não emite toast/callback após fechar durante envio', async () => {
    let resolve!: (v: unknown) => void; mocks.write.mockImplementationOnce(() => new Promise(r => { resolve = r; })); const view = show(); await screen.findByText('Valor aguardando destino'); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar novo destino' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalled()); view.rerender(<PdvResidualDispositionDialog {...view.props} open={false} />);
    await act(async () => { resolve({ data: { ok: true, order_id: 'o1', cancellation_id: 'cancel1', allocated_amount: 15, resources: [{ kind: 'customer_credit', original_payment_id: 'p1', amount: 15, credit_entry_id: 'c' }] }, error: null }); });
    expect(mocks.toast).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });
});
