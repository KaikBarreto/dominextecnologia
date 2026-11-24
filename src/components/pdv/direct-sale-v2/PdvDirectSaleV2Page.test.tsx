import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { completeSale, releaseAttempt, resolveIdentifier, scannerState, receiptState, openReceipt, pendingReceipt } = vi.hoisted(() => ({
  completeSale: vi.fn(),
  releaseAttempt: vi.fn(),
  resolveIdentifier: vi.fn(),
  scannerState: { onScan: null as null | ((code: string) => void) },
  receiptState: { autoPrint: false },
  openReceipt: vi.fn(),
  pendingReceipt: vi.fn(),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }),
}));
vi.mock('@/hooks/useBarcodeScanner', () => ({
  useBarcodeScanner: ({ onScan }: { onScan: (code: string) => void }) => { scannerState.onScan = onScan; },
}));
vi.mock('@/hooks/useInventoryIdentifiers', () => ({
  useInventoryIdentifiers: () => ({ resolve: { mutateAsync: resolveIdentifier, isPending: false } }),
}));
vi.mock('@/components/inventory/identifiers/InventoryIdentifierCameraScanner', () => ({
  InventoryIdentifierCameraScanner: () => null,
}));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({
  usePdvReceiptSettings: () => ({ data: { defaultFormat: '80mm', autoPrint: false, copies: 1, stages: { sale: { format: '58mm', autoPrint: receiptState.autoPrint, copies: 3 } } } }),
}));
vi.mock('@/utils/openPdfInTab', () => ({ openPendingPdfTab: pendingReceipt }));
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
vi.mock('@/components/pdv/PdvProductListItem', () => ({
  PdvProductListItem: ({ product, onSelect }: { product: { name: string }; onSelect: (product: unknown) => void }) => (
    <button type="button" onClick={() => onSelect(product)}>{product.name}</button>
  ),
}));
vi.mock('@/components/pdv/PdvCartPanel', () => ({
  PdvCartPanel: ({ cart, onRequestPayment, onCustomerChange, appliedCreditContent }: {
    cart: { lines: unknown[] };
    onRequestPayment: () => void;
    onCustomerChange: (customerId: string | null) => void;
    appliedCreditContent?: ReactNode;
  }) => (
    <div>
      <span>linhas:{cart.lines.length}</span>
      <button type="button" onClick={() => onCustomerChange('customer-1')}>selecionar-cliente</button>
      <button type="button" onClick={() => onCustomerChange(null)}>limpar-cliente</button>
      {appliedCreditContent}
      <button type="button" onClick={onRequestPayment}>pagar</button>
    </div>
  ),
}));
vi.mock('@/components/pdv/PdvCartItemsTable', () => ({ PdvCartItemsTable: () => null }));
vi.mock('@/components/pdv/PdvCartSummary', () => ({ PdvCartSummary: () => null }));
vi.mock('@/components/pdv/PdvAppliedVoucherControl', () => ({
  PdvAppliedVoucherControl: ({ customerId, onChange }: {
    customerId: string | null;
    onChange: (value: { voucherId: string; code: string; amount: number; balance: number; expiresOn: null }) => void;
  }) => customerId ? (
    <button type="button" onClick={() => onChange({ voucherId: 'voucher-1', code: 'DEV-1042', amount: 40, balance: 80, expiresOn: null })}>
      aplicar-voucher-teste
    </button>
  ) : null,
}));
vi.mock('@/components/pdv/PdvPaymentDialog', () => ({
  PdvPaymentDialog: ({ open, total, appliedVoucher, onConfirm }: {
    open: boolean;
    total: number;
    appliedVoucher?: { voucherId: string; amount: number } | null;
    onConfirm: (payments: unknown[]) => Promise<void>;
  }) => open ? (
    <div>
      <span>voucher-status:{appliedVoucher?.voucherId ?? 'sem'}</span>
      <button type="button" onClick={() => void onConfirm([
        ...(appliedVoucher ? [{ method: 'voucher', amount: appliedVoucher.amount, reference_id: appliedVoucher.voucherId }] : []),
        { method: 'pix', amount: total - (appliedVoucher?.amount ?? 0), account_id: 'bank-1' },
      ])}>
        confirmar-venda
      </button>
    </div>
  ) : null,
}));
vi.mock('@/components/pdv/receipt/PdvOrderReceiptButton', () => ({
  PdvOrderReceiptButton: ({ orderId }: { orderId: string }) => <button type="button">comprovante:{orderId}</button>,
  openPdvOrderReceipt: openReceipt,
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
  beforeEach(() => {
    vi.clearAllMocks();
    scannerState.onScan = null;
    receiptState.autoPrint = false;
    localStorage.removeItem('pdv.receipt.device-format.v1');
  });

  it('mantém a busca fora do preenchimento automático e Enter inclui o material', async () => {
    render(<PdvDirectSaleV2Page directSale={directSale()} />);

    const search = screen.getByRole('combobox', { name: 'Buscar material por nome ou código' });
    expect(search).toHaveAttribute('autocomplete', 'off');
    expect(search).toHaveAttribute('data-form-type', 'other');
    fireEvent.change(search, { target: { value: 'Produto' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(screen.getByText('linhas:1')).toBeInTheDocument();
    await waitFor(() => expect(search).toHaveFocus());
  });

  it('abre um PDF com as vias configuradas somente depois da confirmação persistida', async () => {
    receiptState.autoPrint = true;
    const target = { close: vi.fn(), closed: false } as unknown as Window;
    pendingReceipt.mockReturnValue(target);
    let confirm!: (result: unknown) => void;
    completeSale.mockImplementationOnce(() => new Promise(resolve => { confirm = resolve; }));
    const { rerender } = render(<PdvDirectSaleV2Page directSale={directSale()} />);
    expect(pendingReceipt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: 'Adicionar SKU-1 Produto seguro' }));
    fireEvent.click(screen.getByRole('button', { name: 'pagar' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-venda' }));
    expect(pendingReceipt).toHaveBeenCalledOnce();
    expect(openReceipt).not.toHaveBeenCalled();
    await act(async () => { confirm({ orderId: 'automatic-order', orderNumber: 90, total: 100, subtotal: 100, discountAmount: 0, idempotent: false }); });
    await waitFor(() => expect(openReceipt).toHaveBeenCalledExactlyOnceWith('automatic-order', '58mm', { target, copies: 3, documentKind: 'sale' }));
    rerender(<PdvDirectSaleV2Page directSale={directSale()} />);
    expect(openReceipt).toHaveBeenCalledOnce();
    expect(completeSale).toHaveBeenCalledOnce();
  });

  it('não abre comprovante automático para resposta idempotente de uma venda já concluída', async () => {
    receiptState.autoPrint = true;
    const target = { close: vi.fn(), closed: false } as unknown as Window;
    pendingReceipt.mockReturnValue(target);
    completeSale.mockResolvedValueOnce({ orderId: 'replayed-order', orderNumber: 91, total: 100, subtotal: 100, discountAmount: 0, idempotent: true });
    render(<PdvDirectSaleV2Page directSale={directSale()} />);
    fireEvent.click(screen.getByRole('option', { name: 'Adicionar SKU-1 Produto seguro' }));
    fireEvent.click(screen.getByRole('button', { name: 'pagar' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-venda' }));
    await screen.findByRole('button', { name: 'comprovante:replayed-order' });
    expect(openReceipt).not.toHaveBeenCalled();
    expect(target.close).toHaveBeenCalledOnce();
  });

  it('mantém layout responsivo e conclui uma única escrita v2 com comprovante pelo orderId', async () => {
    completeSale.mockResolvedValueOnce({
      orderId: 'order-1', orderNumber: 42, deliveryId: 'delivery-1',
      subtotal: 123456789.99, discountAmount: 0, total: 123456789.99, idempotent: false,
    });
    render(<PdvDirectSaleV2Page directSale={directSale()} />);

    expect(screen.getByTestId('pdv-direct-sale-v2-layout').querySelector('.sale > .catalog')).toBeInTheDocument();
    expect(screen.getByTestId('pdv-direct-sale-v2-layout').querySelector('.sale > .cart')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Adicionar SKU-1 Produto seguro' }));
    expect(screen.getByText('linhas:1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'pagar' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-venda' }));

    await waitFor(() => expect(completeSale).toHaveBeenCalledTimes(1));
    expect(completeSale.mock.calls[0][0]).toMatchObject({
      terminalId: 'terminal-1', cashSessionId: 'session-1', cashAccountId: 'cash-1',
      items: [{ inventoryId: 'material-1', stockId: 'stock-1', unitPrice: 123456789.99 }],
    });
    expect(await screen.findByRole('button', { name: 'comprovante:order-1' })).toBeInTheDocument();
    expect(screen.getByText(/^Total .*123\.456\.789,99/)).toBeInTheDocument();
    expect(releaseAttempt).toHaveBeenCalledTimes(1);
  });

  it('resolve embalagem pelo identificador e aplica o fator na quantidade', async () => {
    resolveIdentifier.mockResolvedValueOnce({
      identifierId: 'identifier-1', identifierType: 'qr', code: 'CAIXA-2',
      unitLabel: 'caixa', unitFactor: 2, isPrimary: false,
      material: { id: 'material-1', name: 'Produto seguro', sku: 'SKU-1', unit: 'un', salePrice: 123456789.99, archivedAt: null },
    });
    completeSale.mockResolvedValueOnce({
      orderId: 'order-2', orderNumber: 43, deliveryId: 'delivery-2',
      subtotal: 246913579.98, discountAmount: 0, total: 246913579.98, idempotent: false,
    });
    render(<PdvDirectSaleV2Page directSale={directSale()} />);

    await act(async () => { scannerState.onScan?.('CAIXA-2'); });
    fireEvent.click(screen.getByRole('button', { name: 'pagar' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-venda' }));

    await waitFor(() => expect(completeSale).toHaveBeenCalledTimes(1));
    expect(completeSale.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ inventoryId: 'material-1', quantity: 2 }),
    ]);
  });

  it('envia voucher como liquidação separada sem reduzir o total ou o desconto da venda', async () => {
    completeSale.mockResolvedValueOnce({
      orderId: 'order-voucher', orderNumber: 45, deliveryId: 'delivery-voucher',
      subtotal: 123456789.99, discountAmount: 0, total: 123456789.99, idempotent: false,
    });
    render(<PdvDirectSaleV2Page directSale={directSale()} />);

    fireEvent.click(screen.getByRole('option', { name: 'Adicionar SKU-1 Produto seguro' }));
    fireEvent.click(screen.getByRole('button', { name: 'selecionar-cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'aplicar-voucher-teste' }));
    fireEvent.click(screen.getByRole('button', { name: 'pagar' }));
    expect(screen.getByText('voucher-status:voucher-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-venda' }));

    await waitFor(() => expect(completeSale).toHaveBeenCalledTimes(1));
    expect(completeSale.mock.calls[0][0]).toMatchObject({
      customerId: 'customer-1',
      orderDiscountAmount: 0,
      payments: [
        { method: 'voucher', amount: 40, reference_id: 'voucher-1' },
        { method: 'pix', amount: 123456749.99, account_id: 'bank-1' },
      ],
    });
  });

  it('limpa o voucher ao trocar ou remover o cliente', () => {
    render(<PdvDirectSaleV2Page directSale={directSale()} />);
    fireEvent.click(screen.getByRole('option', { name: 'Adicionar SKU-1 Produto seguro' }));
    fireEvent.click(screen.getByRole('button', { name: 'selecionar-cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'aplicar-voucher-teste' }));
    fireEvent.click(screen.getByRole('button', { name: 'limpar-cliente' }));
    fireEvent.click(screen.getByRole('button', { name: 'pagar' }));
    expect(screen.getByText('voucher-status:sem')).toBeInTheDocument();
  });

  it('não perde quantidade quando duas leituras resolvem juntas', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    resolveIdentifier.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    completeSale.mockResolvedValueOnce({
      orderId: 'order-3', orderNumber: 44, deliveryId: 'delivery-3',
      subtotal: 246913579.98, discountAmount: 0, total: 246913579.98, idempotent: false,
    });
    render(<PdvDirectSaleV2Page directSale={directSale()} />);

    act(() => {
      scannerState.onScan?.('UN-1');
      scannerState.onScan?.('UN-1');
    });
    await waitFor(() => expect(resolvers).toHaveLength(2));
    const resolved = {
      identifierId: 'identifier-1', identifierType: 'barcode', code: 'UN-1',
      unitLabel: 'un', unitFactor: 1, isPrimary: true,
      material: { id: 'material-1', name: 'Produto seguro', sku: 'SKU-1', unit: 'un', salePrice: 123456789.99, archivedAt: null },
    };
    await act(async () => {
      resolvers[0](resolved);
      resolvers[1](resolved);
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'pagar' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirmar-venda' }));

    await waitFor(() => expect(completeSale).toHaveBeenCalledTimes(1));
    expect(completeSale.mock.calls[0][0].items).toEqual([
      expect.objectContaining({ inventoryId: 'material-1', quantity: 2 }),
    ]);
  });
});
