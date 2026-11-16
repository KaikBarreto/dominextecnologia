import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvCashQueuePanel } from './PdvCashQueuePanel';
import { PDV_RECEIPT_PREVIEW_FIXTURE } from '@/lib/pdv/receipt/fixture';

const state = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true }, roles: ['comercial'], permissions: ['screen:pdv'], hasPermissionRecord: true, loading: false, profileLoading: false },
  cover: vi.fn(), fetch: vi.fn(), pdf: vi.fn(), open: vi.fn(), pending: vi.fn(), close: vi.fn(), toast: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ ...state.auth, isAdminOrGestor: () => false, hasPermission: () => false, hasScreenAccess: () => true }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/lib/format/hooks', () => ({ useLocaleFormatters: () => ({ money: (amount: number) => `R$ ${amount}` }) }));
vi.mock('@/hooks/usePdvSale', () => ({ usePdvCustomerCredit: () => ({ credit: null, isLoading: false, isError: false }) }));
vi.mock('@/hooks/usePdvCounterFlow', () => ({
  usePdvCounterCapability: () => ({ data: { counterEnabled: true, cashierDeliveryEnabled: true } }),
  usePdvCashQueue: () => ({ data: [{ id: 'order-1', number: 1, customerId: null, customerName: 'Cliente fictício', stockName: 'Estoque', total: 10, reservationReady: true }], refetch: vi.fn() }),
  usePdvCoverOrder: () => ({ mutateAsync: state.cover, isPending: false }),
}));
vi.mock('@/components/pdv/PdvAppliedVoucherControl', () => ({ PdvAppliedVoucherControl: () => null, PdvAppliedVouchersControl: () => null }));
vi.mock('@/components/pdv/PdvPaymentDialog', () => ({ PdvPaymentDialog: ({ onConfirm }: { onConfirm: (payments: unknown[]) => Promise<void> }) => <button onClick={() => void onConfirm([{ method: 'pix', amount: 10 }])}>Confirmar fixture</button> }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: { stages: { sale: { autoPrint: true, format: '80mm', copies: 1 } } } }) }));
vi.mock('@/hooks/usePdvOrderReceiptSnapshot', () => ({ fetchPdvOrderReceiptSnapshot: state.fetch }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/lib/pdv/receipt/pdf', () => ({ generatePdvReceiptPdf: state.pdf, preparePdvReceiptSnapshotLogo: async (snapshot: unknown) => snapshot }));
vi.mock('@/utils/openPdfInTab', () => ({ openPendingPdfTab: state.pending, openPdfInTab: state.open }));

function page() { return <MemoryRouter><PdvCashQueuePanel canCover terminalId="terminal-1" sessionId="session-1" cashAccountId="cash-1" accounts={[]} canUseBankAccounts={false} onGoToCashPanel={vi.fn()} /></MemoryRouter>; }

describe('comprovante automático do recebimento usa contexto anterior ao writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth = { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true }, roles: ['comercial'], permissions: ['screen:pdv'], hasPermissionRecord: true, loading: false, profileLoading: false };
    state.pending.mockImplementation(() => ({ closed: false, close: state.close }));
    state.fetch.mockResolvedValue(PDV_RECEIPT_PREVIEW_FIXTURE); state.pdf.mockReturnValue(new Blob());
  });
  it.each(['empresa', 'usuário', 'revogação', 'inativo', 'desmontagem'])('confirmação tardia após %s não emite PDF nem aviso no novo contexto', async phase => {
    let finish!: (data: unknown) => void;
    state.cover.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { rerender, unmount } = render(page());
    fireEvent.click(screen.getByRole('button', { name: 'Receber e entregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar fixture' }));
    expect(state.cover).toHaveBeenCalledOnce(); expect(state.pending).toHaveBeenCalledOnce();
    if (phase === 'empresa') state.auth.profile.company_id = 'company-2';
    if (phase === 'usuário') { state.auth.user.id = 'user-2'; state.auth.profile.user_id = 'user-2'; }
    if (phase === 'revogação') state.auth.permissions = [];
    if (phase === 'inativo') state.auth.profile.is_active = false;
    if (phase === 'desmontagem') unmount(); else rerender(page());
    await act(async () => { finish({ idempotent: false }); });
    expect(state.close).toHaveBeenCalled(); expect(state.fetch).not.toHaveBeenCalled(); expect(state.pdf).not.toHaveBeenCalled(); expect(state.open).not.toHaveBeenCalled(); expect(state.toast).not.toHaveBeenCalled();
  });
  it('preserva o PDF e a confirmação normal depois do writer persistir', async () => {
    state.cover.mockResolvedValue({ idempotent: false });
    render(page()); fireEvent.click(screen.getByRole('button', { name: 'Receber e entregar' })); fireEvent.click(screen.getByRole('button', { name: 'Confirmar fixture' }));
    await waitFor(() => expect(state.open).toHaveBeenCalledOnce());
    expect(state.fetch).toHaveBeenCalledWith('order-1', expect.any(AbortSignal));
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pedido recebido e entregue' }));
  });
});
