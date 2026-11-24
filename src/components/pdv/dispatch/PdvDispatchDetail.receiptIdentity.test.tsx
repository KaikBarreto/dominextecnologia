import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdvAfterSaleAccess } from '@/hooks/usePdvAfterSale';
import { PdvDispatchDetail } from './PdvDispatchDetail';

const mocks = vi.hoisted(() => ({ complete: vi.fn(), fetchReceipt: vi.fn(), pdf: vi.fn(), toast: vi.fn(), close: vi.fn(), pending: vi.fn() }));
vi.mock('@/hooks/usePdvDispatch', () => ({
  usePdvCompleteDispatch: () => ({ mutateAsync: mocks.complete, isPending: false }),
  fetchPdvDeliveryReceipt: mocks.fetchReceipt,
  stablePdvAttempt: () => ({ signature: 'fixture', id: 'attempt-fixture' }),
}));
vi.mock('@/components/pdv/returns/PdvReturnsPanel', () => ({ PdvReturnsPanel: () => <div>Devoluções autorizadas</div> }));
vi.mock('@/components/pdv/after-sale/PdvAfterSalePanel', () => ({ PdvAfterSalePanel: () => <div>Histórico financeiro autorizado</div> }));
vi.mock('@/hooks/usePdvReceiptCompany', () => ({ usePdvReceiptCompany: () => null, PDV_RECEIPT_COMPANY_PENDING: 'Aguarde a identificação da empresa para gerar o comprovante.' }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: { stages: { delivery: { autoPrint: true, format: '80mm', copies: 1 } } } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/utils/openPdfInTab', () => ({ openPendingPdfTab: mocks.pending }));
vi.mock('@/lib/pdv/deliveryReceiptPdf', () => ({ previewPdvDeliveryReceipt: mocks.pdf, toPdvDeliveryReceiptSnapshot: vi.fn() }));
vi.mock('@/lib/pdv/receipt/pdf', () => ({ preparePdvReceiptSnapshotLogo: vi.fn() }));

describe('retirada confirmada com identidade do documento pendente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending.mockReturnValue({ closed: false, close: mocks.close });
    mocks.complete.mockResolvedValue({ delivery_id: 'delivery-identity-pending', status: 'entregue', idempotent: false });
  });

  it('preserva a confirmação do writer e a conclusão do atendimento, cancelando somente o PDF', async () => {
    const reload = vi.fn();
    const completed = vi.fn();
    const detail = {
      order: { id: 'order-fixture', number: 12, status: 'liberado_retirada', customer: null, stock: null },
      items: [{ id: 'line-fixture', description: 'Item fictício', itemType: 'service', unit: 'un', orderedQuantity: 2, deliveredQuantity: 0, remainingQuantity: 2, reservations: [] }],
    } as Parameters<typeof PdvDispatchDetail>[0]['detail'];
    render(<PdvDispatchDetail detail={detail} canDeliver onReload={reload} onCompleted={completed} />);
    const button = screen.getByRole('button', { name: 'Registrar retirada' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(completed).toHaveBeenCalledWith('delivery-identity-pending'));
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith({ orderId: 'order-fixture', lines: [{ orderItemId: 'line-fixture', quantity: 2, reservationId: null }], attemptId: 'attempt-fixture' });
    expect(reload).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Comprovante automático indisponível' })));
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.fetchReceipt).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Comprovante' })).toBeDisabled();
  });
});


describe('consulta financeira autorizada na expedição', () => {
  const detail = { order: { id: 'order-fixture', number: 12, status: 'liberado_retirada', customer: null, stock: null }, items: [] } as unknown as Parameters<typeof PdvDispatchDetail>[0]['detail'];
  const access: PdvAfterSaleAccess = { enabled: true, canView: true, canIssueVoucher: false, canRequestRefund: false, canConfirmRefund: false, canReverseRefund: false, canReverseVoucher: false, canCreateExchange: false, canApproveCredit: false };
  it('oculta a aba quando a funcionalidade existe mas o perfil não pode consultar', () => {
    render(<PdvDispatchDetail detail={detail} canDeliver={false} onReload={vi.fn()} afterSaleAccess={{ ...access!, canView: false }} />);
    expect(screen.queryByRole('button', { name: 'Créditos e reembolsos' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Itens da retirada' })).toBeInTheDocument();
  });
  it('retorna imediatamente à retirada quando a permissão da aba aberta é revogada', () => {
    const { rerender } = render(<PdvDispatchDetail detail={detail} canDeliver={false} onReload={vi.fn()} afterSaleAccess={access} />);
    fireEvent.click(screen.getByRole('button', { name: 'Créditos e reembolsos' }));
    expect(screen.getByText('Histórico financeiro autorizado')).toBeInTheDocument();
    rerender(<PdvDispatchDetail detail={detail} canDeliver={false} onReload={vi.fn()} afterSaleAccess={{ ...access!, canView: false }} />);
    expect(screen.queryByText('Histórico financeiro autorizado')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créditos e reembolsos' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Itens da retirada' })).toBeInTheDocument();
  });
  it('não deixa a aba Devoluções vazia quando não resta nenhuma ação permitida', () => {
    const returnsAccess = { enabled: true, canReturn: true, canReverse: false, canCancelResidual: false, canBackdate: false };
    const { rerender } = render(<PdvDispatchDetail detail={detail} canDeliver={false} onReload={vi.fn()} returnsAccess={returnsAccess} />);
    fireEvent.click(screen.getByRole('button', { name: 'Devoluções' }));
    expect(screen.getByText('Devoluções autorizadas')).toBeInTheDocument();
    rerender(<PdvDispatchDetail detail={detail} canDeliver={false} onReload={vi.fn()} returnsAccess={{ ...returnsAccess, canReturn: false }} />);
    expect(screen.queryByRole('button', { name: 'Devoluções' })).not.toBeInTheDocument();
    expect(screen.queryByText('Devoluções autorizadas')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Itens da retirada' })).toBeInTheDocument();
  });

});
