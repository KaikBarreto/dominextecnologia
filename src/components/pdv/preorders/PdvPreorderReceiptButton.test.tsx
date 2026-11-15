import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvPreorderReceiptButton, openPdvPreorderReceipt } from './PdvPreorderReceiptButton';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), pdf: vi.fn(), open: vi.fn(), pending: vi.fn(), toast: vi.fn(), device: vi.fn(), company: vi.fn() }));
vi.mock('@/hooks/usePdvPreorders', () => ({ fetchPdvPreorderDetail: mocks.fetch }));
vi.mock('@/hooks/usePdvReceiptCompany', () => ({ usePdvReceiptCompany: mocks.company, PDV_RECEIPT_COMPANY_PENDING: 'Aguarde a identificação da empresa para gerar o comprovante.' }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: { defaultFormat: 'a4', stages: { budget: { format: '58mm', copies: 1, autoPrint: false } } } }) }));
vi.mock('@/lib/pdv/receipt/devicePreference', () => ({ readDeviceReceiptFormat: mocks.device }));
vi.mock('@/lib/pdv/receipt/pdf', () => ({ generatePdvReceiptPdf: mocks.pdf, preparePdvReceiptSnapshotLogo: async (snapshot: unknown) => snapshot }));
vi.mock('@/utils/openPdfInTab', () => ({ openPendingPdfTab: mocks.pending, openPdfInTab: mocks.open }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

describe('comprovante do orçamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.company.mockReturnValue({ name: 'Empresa exemplo', whiteLabelEnabled: false });
    mocks.device.mockReturnValue(null);
    mocks.fetch.mockResolvedValue({ preorder: { number: 12, converted_order_id: 'venda-confirmada', updated_at: '2026-11-14T10:00:00Z', discount_amount: 0 }, items: [{ inventory_id: 'item', description: 'Item exemplo', quantity: 2, unit_price: 10, discount_amount: 0 }] });
    mocks.pdf.mockReturnValue(new Blob());
  });

  it('reimprime orçamento convertido como orçamento, sem substituir pelo pedido pago', async () => {
    render(<PdvPreorderReceiptButton preorderId="budget-12" customerName="Cliente exemplo" />);
    fireEvent.click(screen.getByRole('button', { name: /gerar comprovante/i }));
    await waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
    expect(mocks.fetch).toHaveBeenCalledWith('budget-12');
    expect(mocks.pdf).toHaveBeenCalledWith(expect.objectContaining({ documentKind: 'budget', payments: [], totals: { subtotal: 20, discount: 0, total: 20 } }), '58mm', { copies: 1 });
    expect(mocks.open.mock.calls[0][1]).toBe('Orçamento 12 - Cliente exemplo');
  });

  it('respeita preferência de formato do dispositivo', async () => {
    mocks.device.mockReturnValue('80mm');
    render(<PdvPreorderReceiptButton preorderId="budget-12" />);
    fireEvent.click(screen.getByRole('button', { name: /gerar comprovante/i }));
    await waitFor(() => expect(mocks.pdf).toHaveBeenCalled());
    expect(mocks.pdf.mock.calls[0][1]).toBe('80mm');
  });

  it('bloqueia emissão manual sem identidade da empresa e não abre aba ou PDF', async () => {
    mocks.company.mockReturnValue(null);
    render(<PdvPreorderReceiptButton preorderId="budget-12" />);
    const button = screen.getByRole('button', { name: /gerar comprovante/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.pending).not.toHaveBeenCalled();
    await expect(openPdvPreorderReceipt('budget-12', { company: null, format: 'a4' })).rejects.toThrow('Aguarde a identificação da empresa');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
