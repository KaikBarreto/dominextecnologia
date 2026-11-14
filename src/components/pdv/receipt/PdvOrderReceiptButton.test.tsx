import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDV_RECEIPT_PREVIEW_FIXTURE } from '@/lib/pdv/receipt/fixture';
import { PdvOrderReceiptButton } from './PdvOrderReceiptButton';

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
    mocks.prepareLogo.mockResolvedValue(PDV_RECEIPT_PREVIEW_FIXTURE);
    mocks.generatePdf.mockReturnValue(new Blob(['pdf'], { type: 'application/pdf' }));
    mocks.openPending.mockReturnValue(null);
  });

  it('consulta o snapshot imutável pelo pedido e apenas abre o PDF', async () => {
    render(<PdvOrderReceiptButton orderId="pedido-1042" format="80mm" />);

    fireEvent.click(screen.getByRole('button', { name: /reimprimir comprovante/i }));

    await waitFor(() => expect(mocks.openPdf).toHaveBeenCalledOnce());
    expect(mocks.fetchSnapshot).toHaveBeenCalledWith('pedido-1042');
    expect(mocks.generatePdf).toHaveBeenCalledWith(PDV_RECEIPT_PREVIEW_FIXTURE, '80mm');
    expect(mocks.openPdf.mock.calls[0]?.[1]).toBe('Comprovante de Venda 1042 - Cliente exemplo');
  });
});
