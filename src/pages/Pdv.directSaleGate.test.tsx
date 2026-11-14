import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { shouldUseLegacyPdvRoute } from '@/hooks/usePdvDirectSaleV2';
import { adaptPdvDirectSaleV2Result, PdvSaleContractGate } from '@/pages/Pdv';

function directSale(contract: 'legacy' | 'v2' | 'blocked', loading = false) {
  return {
    contract,
    capability: { isLoading: loading, refetch: vi.fn() },
  } as unknown as Parameters<typeof PdvSaleContractGate>[0]['directSale'];
}

describe('PdvSaleContractGate', () => {
  it('mantém edição de pedido no contrato legado', () => {
    expect(shouldUseLegacyPdvRoute('?editar=order-1')).toBe(true);
    expect(shouldUseLegacyPdvRoute('')).toBe(false);
  });

  it('não deixa a rota de edição contornar capability desconhecida', () => {
    render(
      <PdvSaleContractGate
        directSale={directSale('blocked')}
        legacy={<div>editor-legado</div>}
        editRoute
      />,
    );
    expect(screen.getByTestId('pdv-direct-sale-gate-blocked')).toBeInTheDocument();
    expect(screen.queryByText('editor-legado')).not.toBeInTheDocument();
  });

  it('falha fechado ao editar no contrato v2 sem writer de substituição v2', () => {
    render(
      <PdvSaleContractGate directSale={directSale('v2')} legacy={<div>editor-legado</div>} editRoute />,
    );
    expect(screen.getByTestId('pdv-direct-sale-v2-edit-blocked')).toBeInTheDocument();
    expect(screen.queryByText('editor-legado')).not.toBeInTheDocument();
  });

  it('mantém o PDV legado somente quando a capability retorna false explícito', () => {
    render(<PdvSaleContractGate directSale={directSale('legacy')} legacy={<div>caminho-v1</div>} />);
    expect(screen.getByText('caminho-v1')).toBeInTheDocument();
    expect(screen.queryByText('caminho-v2')).not.toBeInTheDocument();
  });

  it('preserva o mesmo workspace visual quando a capability retorna true', () => {
    render(<PdvSaleContractGate directSale={directSale('v2')} legacy={<div>caminho-v1</div>} />);
    expect(screen.getByText('caminho-v1')).toBeInTheDocument();
  });

  it('falha fechado durante loading ou erro e oferece retry sem montar venda', () => {
    const { rerender } = render(
      <PdvSaleContractGate directSale={directSale('blocked', true)} legacy={<div>caminho-v1</div>} />,
    );
    expect(screen.getByTestId('pdv-direct-sale-gate-blocked')).toBeInTheDocument();
    expect(screen.queryByText('caminho-v1')).not.toBeInTheDocument();

    rerender(<PdvSaleContractGate directSale={directSale('blocked')} legacy={<div>caminho-v1</div>} />);
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('adapta apenas o resultado visual v2 e preserva o troco informado', () => {
    const result = adaptPdvDirectSaleV2Result(
      {
        orderId: 'order-1', orderNumber: 42, deliveryId: 'delivery-1',
        subtotal: 100, discountAmount: 0, total: 100, idempotent: false,
      },
      [{ method: 'dinheiro', amount: 100, change_amount: 20 }],
      2,
      '2026-11-07T12:00:00.000Z',
    );

    expect(result).toMatchObject({
      order_id: 'order-1', numero: 42, status: 'entregue', total: 100, itens: 2,
      pagamentos: [{ method: 'dinheiro', amount: 100, change_amount: 20 }],
    });
  });
});
