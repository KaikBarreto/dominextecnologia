import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { completeSale, releaseAttempt } = vi.hoisted(() => ({
  completeSale: vi.fn(),
  releaseAttempt: vi.fn(),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }),
}));
vi.mock('@/hooks/useBarcodeScanner', () => ({ useBarcodeScanner: vi.fn() }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({
  usePdvReceiptSettings: () => ({ data: { defaultFormat: '80mm', autoPrint: false, copies: 1 } }),
}));
vi.mock('@/hooks/usePdvSale', () => ({
  useUploadPdvOrderAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/pdv/PdvAdvancedOptionsDialog', () => ({ PdvAdvancedOptionsDialog: () => null }));
vi.mock('@/components/pdv/PdvProductCard', () => ({
  PdvProductCard: ({ product, onSelect }: { product: { name: string }; onSelect: (product: unknown) => void }) => (
    <button type="button" onClick={() => onSelect(product)}>{product.name}</button>
  ),
}));
vi.mock('@/components/pdv/PdvCartPanel', () => ({
  PdvCartPanel: ({ cart, onRequestPayment }: { cart: { lines: unknown[] }; onRequestPayment: () => void }) => (
    <div><span>linhas:{cart.lines.length}</span><button type="button" onClick={onRequestPayment}>pagar</button></div>
  ),
}));
vi.mock('@/components/pdv/PdvCartItemsTable', () => ({ PdvCartItemsTable: () => null }));
vi.mock('@/components/pdv/PdvCartSummary', () => ({ PdvCartSummary: () => null }));
vi.mock('@/components/pdv/PdvPaymentDialog', () => ({
  PdvPaymentDialog: ({ open, onConfirm }: { open: boolean; onConfirm: (payments: unknown[]) => Promise<void> }) => open ? (
    <button type="button" onClick={() => void onConfirm([{ method: 'pix', amount: 123456789.99, account_id: 'bank-1' }])}>
      confirmar-venda
    </button>
  ) : null,
}));
vi.mock('@/components/pdv/receipt/PdvOrderReceiptButton', () => ({
  PdvOrderReceiptButton: ({ orderId }: { orderId: string }) => <button type="button">comprovante:{orderId}</button>,
}));

import { PdvDirectSaleV2Page } from '@/components/pdv/direct-sale-v2/PdvDirectSaleV2Page';

function directSale() {
  return {
    catalog: {
      data: {
        materials: [{
          id: 'material-1', name: 'Produto seguro', sku: 'SKU-1', barcode: '789', unit: 'un',
          salePrice: 123456789.99, imageUrl: null,
          availableByStock: [{ stockId: 'stock-1', availableQuantity: 2, hasConflict: false }],
        }],
        customers: [{ id: 'customer-1', name: 'Cliente permitido' }],
        terminals: [{ id: 'terminal-1', name: 'Caixa 1', stockId: 'stock-1' }],
        sessions: [{ id: 'session-1', terminalId: 'terminal-1', cashAccountId: 'cash-1', openedAt: '2026-11-07T12:00:00Z' }],
        cashAccount: { id: 'cash-1', name: 'Cofre' },
        bankAccounts: [{ id: 'bank-1', name: 'Banco', type: 'banco', color: null, institutionCode: null, institutionName: null, bankName: null }],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    },
    complete: { mutateAsync: completeSale },
    releaseAttempt,
  } as unknown as Parameters<typeof PdvDirectSaleV2Page>[0]['directSale'];
}

describe('PdvDirectSaleV2Page', () => {
  it('mantém layout responsivo e conclui uma única escrita v2 com comprovante pelo orderId', async () => {
    completeSale.mockResolvedValueOnce({
      orderId: 'order-1', orderNumber: 42, deliveryId: 'delivery-1',
      subtotal: 123456789.99, discountAmount: 0, total: 123456789.99, idempotent: false,
    });
    render(<PdvDirectSaleV2Page directSale={directSale()} />);

    expect(screen.getByTestId('pdv-direct-sale-v2-layout')).toHaveClass('grid-cols-1');
    fireEvent.click(screen.getByRole('button', { name: 'Produto seguro' }));
    expect(screen.getByText('linhas:1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'pagar' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-venda' }));

    await waitFor(() => expect(completeSale).toHaveBeenCalledTimes(1));
    expect(completeSale.mock.calls[0][0]).toMatchObject({
      terminalId: 'terminal-1', cashSessionId: 'session-1', cashAccountId: 'cash-1',
      items: [{ inventoryId: 'material-1', stockId: 'stock-1', unitPrice: 123456789.99 }],
    });
    expect(await screen.findByRole('button', { name: 'comprovante:order-1' })).toBeInTheDocument();
    expect(screen.getByText(/123\.456\.789,99/)).toBeInTheDocument();
    expect(releaseAttempt).toHaveBeenCalledTimes(1);
  });
});
