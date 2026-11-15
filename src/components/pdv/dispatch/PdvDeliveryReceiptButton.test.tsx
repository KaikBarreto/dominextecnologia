import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PdvDeliveryReceiptButton, openPdvDeliveryReceipt } from './PdvDeliveryReceiptButton';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), preview: vi.fn(), pending: vi.fn() }));
vi.mock('@/hooks/usePdvDispatch', () => ({ fetchPdvDeliveryReceipt: mocks.fetch }));
vi.mock('@/lib/pdv/deliveryReceiptPdf', () => ({ previewPdvDeliveryReceipt: mocks.preview, toPdvDeliveryReceiptSnapshot: (_snapshot: unknown, options: unknown) => options }));
vi.mock('@/lib/pdv/receipt/pdf', () => ({ preparePdvReceiptSnapshotLogo: async (snapshot: unknown) => snapshot }));
vi.mock('@/utils/openPdfInTab', () => ({ openPendingPdfTab: mocks.pending }));
vi.mock('@/hooks/usePdvReceiptCompany', () => ({ usePdvReceiptCompany: () => null, PDV_RECEIPT_COMPANY_PENDING: 'Aguarde a identificação da empresa para gerar o comprovante.' }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('comprovante da retirada persistida', () => {
  beforeEach(() => vi.clearAllMocks());
  it('usa apenas o evento parcial retornado, com empresa real e formato escolhido', async () => {
    const event = { deliveryId: 'withdrawal-2', withdrawnAt: '2026-11-14T10:30:00Z', order: { id: 'order-1', number: 1, status: 'retirada_parcial' }, customerName: 'Cliente exemplo', stockName: 'Depósito', items: [{ description: 'Material exemplo', unit: 'un', quantity: 1, remainingQuantity: 4 }] };
    mocks.fetch.mockResolvedValue(event);
    const target = { close: vi.fn() } as unknown as Window;
    const company = { name: 'Empresa exemplo', whiteLabelEnabled: false };
    await openPdvDeliveryReceipt('withdrawal-2', '80mm', { target, company, copies: 2 });
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('withdrawal-2');
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(event, target, { company, format: '80mm', copies: 2 });
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(event.items[0]).toEqual({ description: 'Material exemplo', unit: 'un', quantity: 1, remainingQuantity: 4 });
  });

  it('desabilita emissão manual e fecha placeholder automático sem buscar dados quando identidade não está pronta', async () => {
    render(<PdvDeliveryReceiptButton deliveryId="withdrawal-2" />);
    const button = screen.getByRole('button', { name: 'Comprovante' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    const target = { close: vi.fn() } as unknown as Window;
    await expect(openPdvDeliveryReceipt('withdrawal-2', '80mm', { target, company: null })).rejects.toThrow('Aguarde a identificação da empresa');
    expect(target.close).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.pending).not.toHaveBeenCalled();
  });
});
