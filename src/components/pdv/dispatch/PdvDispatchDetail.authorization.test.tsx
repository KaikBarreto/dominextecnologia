import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvDispatchDetail } from './PdvDispatchDetail';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(), fetch: vi.fn(), preview: vi.fn(), toast: vi.fn(), close: vi.fn(), pending: vi.fn(),
  auth: { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true }, roles: ['estoque'], permissions: ['screen:pdv_dispatch', 'fn:deliver_pdv_order'], hasPermissionRecord: true, loading: false, profileLoading: false },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/usePdvDispatch', () => ({
  usePdvCompleteDispatch: () => ({ mutateAsync: mocks.complete, isPending: false }),
  fetchPdvDeliveryReceipt: mocks.fetch,
  stablePdvAttempt: () => ({ signature: 'fixture', id: 'attempt-fixture' }),
}));
vi.mock('@/components/pdv/returns/PdvReturnsPanel', () => ({ PdvReturnsPanel: () => null }));
vi.mock('@/components/pdv/after-sale/PdvAfterSalePanel', () => ({ PdvAfterSalePanel: () => null }));
vi.mock('@/hooks/usePdvReceiptCompany', () => ({ usePdvReceiptCompany: () => ({ name: 'Empresa fictícia', whiteLabelEnabled: false }), PDV_RECEIPT_COMPANY_PENDING: 'Aguarde a identificação da empresa.' }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: { stages: { delivery: { autoPrint: true, format: '80mm', copies: 1 } } } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/utils/openPdfInTab', () => ({ openPendingPdfTab: mocks.pending }));
vi.mock('@/lib/pdv/deliveryReceiptPdf', () => ({ previewPdvDeliveryReceipt: mocks.preview, toPdvDeliveryReceiptSnapshot: (_snapshot: unknown, options: unknown) => options }));
vi.mock('@/lib/pdv/receipt/pdf', () => ({ preparePdvReceiptSnapshotLogo: async (snapshot: unknown) => snapshot }));

const detail = {
  order: { id: 'order-fixture', number: 12, status: 'liberado_retirada', customer: null, stock: null },
  items: [{ id: 'line-fixture', description: 'Item fictício', itemType: 'service', unit: 'un', orderedQuantity: 2, deliveredQuantity: 0, remainingQuantity: 2, reservations: [] }],
} as Parameters<typeof PdvDispatchDetail>[0]['detail'];

describe('confirmação automática da retirada respeita contexto capturado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true }, roles: ['estoque'], permissions: ['screen:pdv_dispatch', 'fn:deliver_pdv_order'], hasPermissionRecord: true, loading: false, profileLoading: false };
    mocks.pending.mockImplementation(() => ({ closed: false, close: mocks.close }));
    mocks.fetch.mockResolvedValue({ deliveryId: 'delivery-fixture' });
  });

  it.each(['empresa', 'usuário', 'revogação', 'inativo', 'desmontagem'] as const)('não gera PDF/toast nem aplica callback tardio do writer depois de %s', async phase => {
    let resolveWriter!: (data: unknown) => void;
    mocks.complete.mockReturnValue(new Promise(resolve => { resolveWriter = resolve; }));
    const onReload = vi.fn(), onCompleted = vi.fn();
    const element = <PdvDispatchDetail detail={detail} canDeliver onReload={onReload} onCompleted={onCompleted} />;
    const { rerender, unmount } = render(element);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar retirada' }));
    expect(mocks.pending).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith({ orderId: 'order-fixture', lines: [{ orderItemId: 'line-fixture', quantity: 2, reservationId: null }], attemptId: 'attempt-fixture' });
    if (phase === 'empresa') mocks.auth.profile.company_id = 'company-2';
    if (phase === 'usuário') { mocks.auth.user.id = 'user-2'; mocks.auth.profile.user_id = 'user-2'; }
    if (phase === 'revogação') mocks.auth.permissions = [];
    if (phase === 'inativo') mocks.auth.profile.is_active = false;
    if (phase === 'desmontagem') unmount(); else rerender(<PdvDispatchDetail detail={{ ...detail }} canDeliver onReload={onReload} onCompleted={onCompleted} />);
    expect(mocks.close).toHaveBeenCalled();
    await act(async () => { resolveWriter({ delivery_id: `delivery-${phase}`, status: 'entregue', idempotent: false }); });
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled(); expect(onReload).not.toHaveBeenCalled(); expect(onCompleted).not.toHaveBeenCalled();
  });

  it('gera o PDF automático uma vez por evento, mantendo confirmação e idempotência visual do writer', async () => {
    mocks.complete.mockResolvedValue({ delivery_id: 'delivery-consumer-repeated', status: 'retirada_parcial', idempotent: false });
    const onReload = vi.fn();
    render(<PdvDispatchDetail detail={detail} canDeliver onReload={onReload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar retirada' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Registrar retirada' }));
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(2));
    expect(onReload).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.preview).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Retirada parcial registrada' }));
  });
});
