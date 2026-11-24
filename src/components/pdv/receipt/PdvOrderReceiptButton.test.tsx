import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDV_RECEIPT_PREVIEW_FIXTURE } from '@/lib/pdv/receipt/fixture';
import { PdvOrderReceiptButton, openPdvOrderReceipt } from './PdvOrderReceiptButton';

const mocks = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  prepareLogo: vi.fn(),
  generatePdf: vi.fn(),
  openPending: vi.fn(),
  openPdf: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/hooks/usePdvOrderReceiptSnapshot', () => ({
  fetchPdvOrderReceiptSnapshot: mocks.fetchSnapshot,
}));
vi.mock('@/lib/pdv/receipt/pdf', () => ({
  preparePdvReceiptSnapshotLogo: mocks.prepareLogo,
  generatePdvReceiptPdf: mocks.generatePdf,
}));
vi.mock('@/utils/openPdfInTab', () => ({
  openPendingPdfTab: mocks.openPending,
  openPdfInTab: mocks.openPdf,
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

describe('PdvOrderReceiptButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchSnapshot.mockResolvedValue(PDV_RECEIPT_PREVIEW_FIXTURE);
    mocks.prepareLogo.mockImplementation(async (snapshot) => snapshot);
    mocks.generatePdf.mockReturnValue(new Blob(['pdf'], { type: 'application/pdf' }));
    mocks.openPending.mockReturnValue(null);
  });

  it('consulta o snapshot imutável pelo pedido e apenas abre o PDF', async () => {
    render(<PdvOrderReceiptButton orderId="pedido-1042" format="80mm" />);

    fireEvent.click(screen.getByRole('button', { name: /reimprimir comprovante/i }));

    await waitFor(() => expect(mocks.openPdf).toHaveBeenCalledOnce());
    expect(mocks.fetchSnapshot).toHaveBeenCalledWith('pedido-1042');
    expect(mocks.generatePdf).toHaveBeenCalledWith({ ...PDV_RECEIPT_PREVIEW_FIXTURE, documentKind: 'pickup' }, '80mm');
    expect(mocks.openPdf.mock.calls[0]?.[1]).toBe('Pedido para Retirada 1042 - Cliente exemplo');
  });

  it('preserva crédito aprovado sem apresentá-lo como pago e gera vias na mesma aba preparada', async () => {
    const coverage = { paidAmount: 100, approvedCreditAmount: 85 };
    mocks.fetchSnapshot.mockResolvedValue({ ...PDV_RECEIPT_PREVIEW_FIXTURE, coverage });
    const target = { close: vi.fn() } as unknown as Window;
    await openPdvOrderReceipt('pedido-fiado', '58mm', { target, copies: 3, documentKind: 'pickup' });
    expect(mocks.openPending).not.toHaveBeenCalled();
    expect(mocks.generatePdf).toHaveBeenCalledWith(expect.objectContaining({ documentKind: 'pickup', coverage }), '58mm', { copies: 3 });
    expect(mocks.openPdf.mock.calls[0][2]).toBe(target);
  });

  it('venda direta usa comprovante de venda mesmo com fulfillment legado de retirada', async () => {
    await openPdvOrderReceipt('direta-1', 'a4', { documentKind: 'sale' });
    expect(mocks.generatePdf).toHaveBeenCalledWith(expect.objectContaining({ documentKind: 'sale' }), 'a4');
    expect(mocks.openPdf.mock.calls[0][1]).toBe('Comprovante de Venda 1042 - Cliente exemplo');
  });
});
