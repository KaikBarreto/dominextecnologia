import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PdvDispatch from './PdvDispatch';

const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true }, roles: ['estoque'], permissions: ['screen:pdv_dispatch', 'fn:deliver_pdv_order'], hasPermissionRecord: true, loading: false, profileLoading: false },
  complete: vi.fn(), fetch: vi.fn(), preview: vi.fn(), toast: vi.fn(), close: vi.fn(), pending: vi.fn(), refetch: vi.fn(), detailReady: false, mobile: false,
}));
const queue = [{ id: 'same-order', number: 11, recipientName: 'Cliente fictício', stockId: 'stock-1', stockName: 'Estoque fictício', status: 'liberado_retirada', releasedAt: '', remainingItems: 1 }];
const detail = { order: { id: 'same-order', number: 11, status: 'liberado_retirada', customer: null, stock: null }, items: [{ id: 'line-1', description: 'Serviço fictício', itemType: 'service', unit: 'un', orderedQuantity: 1, deliveredQuantity: 0, remainingQuantity: 1, reservations: [] }] };
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ ...mocks.auth, isAdminOrGestor: () => false, hasPermission: (permission: string) => mocks.auth.permissions.includes(permission), hasScreenAccess: (permission: string) => mocks.auth.permissions.includes(permission) }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.mobile }));
vi.mock('@/hooks/usePdvDispatch', () => ({
  usePdvCompleteDispatch: () => ({ mutateAsync: mocks.complete, isPending: false }), fetchPdvDeliveryReceipt: mocks.fetch,
  usePdvDispatchQueue: () => ({ data: queue, refetch: mocks.refetch }), usePdvDispatchHistory: () => ({ data: [], refetch: mocks.refetch }),
  usePdvDispatchOrder: (id: string | null) => ({ data: id && mocks.detailReady ? detail : undefined, isFetching: Boolean(id && !mocks.detailReady), refetch: mocks.refetch }),
  stablePdvAttempt: () => ({ signature: 'fixture', id: 'attempt-fixture' }),
}));
vi.mock('@/hooks/usePdvReturns', () => ({ derivePdvReturnsAccess: () => ({ enabled: false }), usePdvReturnsFeature: () => ({ data: false }) }));
vi.mock('@/hooks/usePdvAfterSale', () => ({ derivePdvAfterSaleAccess: () => ({ enabled: false }), usePdvAfterSaleFeature: () => ({ data: false }) }));
vi.mock('@/hooks/usePdvCounterFlow', () => ({ usePdvCounterCapability: () => ({ data: { counterEnabled: false } }) }));
vi.mock('@/components/pdv/flow/PdvFullSalesFlow', () => ({ PdvFullSalesFlow: () => null }));
vi.mock('@/components/pdv/dispatch/PdvDispatchDetail', () => ({ PdvDispatchDetail: () => null }));
vi.mock('@/hooks/usePdvReceiptCompany', () => ({ usePdvReceiptCompany: () => ({ name: 'Empresa fictícia', whiteLabelEnabled: false }), PDV_RECEIPT_COMPANY_PENDING: 'Aguarde a identificação da empresa.' }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: { stages: { delivery: { autoPrint: true, format: '80mm', copies: 1 } } } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/utils/openPdfInTab', () => ({ openPendingPdfTab: mocks.pending }));
vi.mock('@/lib/pdv/deliveryReceiptPdf', () => ({ previewPdvDeliveryReceipt: mocks.preview, toPdvDeliveryReceiptSnapshot: (_snapshot: unknown, options: unknown) => options }));
vi.mock('@/lib/pdv/receipt/pdf', () => ({ preparePdvReceiptSnapshotLogo: async (snapshot: unknown) => snapshot }));

function renderPage() { return <MemoryRouter><PdvDispatch /></MemoryRouter>; }

describe('retirada rápida captura o contexto antes de ler o pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.detailReady = false; mocks.mobile = false;
    mocks.auth = { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true }, roles: ['estoque'], permissions: ['screen:pdv_dispatch', 'fn:deliver_pdv_order'], hasPermissionRecord: true, loading: false, profileLoading: false };
    mocks.pending.mockImplementation(() => ({ close: mocks.close, closed: false }));
  });

  it('abre o detalhe contextual sem substituir o quadro nem registrar retirada', async () => {
    mocks.detailReady = true;
    render(renderPage());
    const board = screen.getByRole('region', { name: 'Kanban da expedição' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Pedido #11' }));

    expect(screen.getByRole('dialog', { name: 'Detalhes da retirada' })).toBeInTheDocument();
    expect(board).toBeInTheDocument();
    expect(board).toHaveTextContent('Aguardando retirada');
    expect(board).toHaveTextContent('Retirada parcial');
    expect(mocks.complete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar retirada' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Detalhes da retirada' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Kanban da expedição' })).toBe(board);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('mantém o quadro ao abrir e fechar a retirada no celular', async () => {
    mocks.mobile = true;
    mocks.detailReady = true;
    render(renderPage());
    fireEvent.click(screen.getByRole('button', { name: 'Kanban' }));
    const board = screen.getByRole('region', { name: 'Kanban da expedição' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Pedido #11' }));
    expect(screen.getByRole('dialog', { name: 'Detalhes da retirada' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar retirada' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Detalhes da retirada' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Kanban da expedição' })).toBe(board);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('não dispara writer do clique de A quando o mesmo ID termina de carregar no contexto B', async () => {
    const { rerender } = render(renderPage());
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como retirado' }));
    expect(mocks.pending).toHaveBeenCalledOnce(); expect(mocks.complete).not.toHaveBeenCalled();
    mocks.auth.profile.company_id = 'company-2'; mocks.detailReady = true;
    rerender(renderPage());
    await waitFor(() => expect(mocks.close).toHaveBeenCalled());
    expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('não gera PDF nem confirma visualmente o retorno tardio do writer em outra empresa', async () => {
    let finish!: (data: unknown) => void;
    mocks.detailReady = true;
    mocks.complete.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { rerender } = render(renderPage());
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como retirado' }));
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce());
    mocks.auth.profile.company_id = 'company-2'; rerender(renderPage());
    await act(async () => { finish({ delivery_id: 'delivery-old', status: 'entregue', idempotent: false }); });
    expect(mocks.close).toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.preview).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });
});
