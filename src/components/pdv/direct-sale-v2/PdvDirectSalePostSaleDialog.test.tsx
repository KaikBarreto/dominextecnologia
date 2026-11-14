import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvDirectSalePostSaleDialog } from './PdvDirectSalePostSaleDialog';

vi.mock('@/components/pdv/receipt/PdvOrderReceiptButton', () => ({
  PdvOrderReceiptButton: ({ orderId }: { orderId: string }) => (
    <button type="button">Comprovante {orderId}</button>
  ),
}));
vi.mock('@/components/pdv/returns/PdvReturnsPanel', () => ({
  PdvReturnsPanel: ({ orderId, remainingQuantity }: { orderId: string; remainingQuantity: number }) => (
    <div>Devolução segura {orderId} saldo {remainingQuantity}</div>
  ),
}));
vi.mock('@/components/pdv/after-sale/PdvAfterSalePanel', () => ({
  PdvAfterSalePanel: ({ orderId }: { orderId: string }) => <div>Valores seguros {orderId}</div>,
}));

const returnsAccess = {
  enabled: true,
  canReturn: true,
  canReverse: false,
  canCancelResidual: true,
  canBackdate: false,
};
const afterSaleAccess = {
  enabled: true,
  canView: true,
  canIssueVoucher: true,
  canRequestRefund: true,
  canConfirmRefund: true,
  canReverseRefund: true,
  canReverseVoucher: true,
  canCreateExchange: true,
  canApproveCredit: true,
};

describe('pós-venda da venda direta entregue', () => {
  it('reutiliza o pedido concluído e não expõe cancelamento de retirada pendente', () => {
    render(
      <PdvDirectSalePostSaleDialog
        open
        onOpenChange={vi.fn()}
        orderId="order-42"
        orderNumber={42}
        receiptFormat="80mm"
        returnsAccess={returnsAccess}
        afterSaleAccess={afterSaleAccess}
      />,
    );

    expect(screen.getByText('Pós-venda do pedido #42')).toBeInTheDocument();
    expect(screen.getByText('Comprovante order-42')).toBeInTheDocument();
    expect(screen.getByText('Devolução segura order-42 saldo 0')).toBeInTheDocument();
    expect(screen.queryByText(/expedição|liberar retirada/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Créditos e reembolsos' }));
    expect(screen.getByText('Valores seguros order-42')).toBeInTheDocument();
  });

  it('não monta operações sem permissão', () => {
    render(
      <PdvDirectSalePostSaleDialog
        open
        onOpenChange={vi.fn()}
        orderId="order-43"
        orderNumber={43}
        receiptFormat="a4"
        returnsAccess={{ ...returnsAccess, enabled: false }}
        afterSaleAccess={{ ...afterSaleAccess, enabled: false }}
      />,
    );

    expect(screen.queryByText(/Devolução segura/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Valores seguros/)).not.toBeInTheDocument();
    expect(screen.getByText('Comprovante order-43')).toBeInTheDocument();
  });
});
