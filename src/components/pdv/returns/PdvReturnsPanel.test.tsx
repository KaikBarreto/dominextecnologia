import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvReturnsPanel, type PdvReturnsAccess } from './PdvReturnsPanel';

vi.mock('@/hooks/usePdvReturns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePdvReturns')>();
  return {
    ...actual,
    usePdvReturnWorkspace: () => ({ isLoading: false, isError: false, refetch: vi.fn(), data: {
      orderId: 'order-1', orderNumber: 42, customerId: 'customer-1',
      items: [{ deliveryItemId: 'delivery-1', orderItemId: 'item-1', description: 'Cimento', itemType: 'material', deliveredQuantity: 4, returnableQuantity: 2, commercialAmount: 200 }],
      stocks: [{ id: 'stock-1', name: 'Loja', destination: 'saleable' }], receivables: [], history: [],
    } }),
  };
});

const access: PdvReturnsAccess = { enabled: true, canReturn: true, canReverse: false, canCancelResidual: true, canBackdate: false };
const renderPanel = (props?: Partial<React.ComponentProps<typeof PdvReturnsPanel>>) => render(<QueryClientProvider client={new QueryClient()}><PdvReturnsPanel orderId="order-1" orderNumber={42} remainingQuantity={3} access={access} onReload={vi.fn()} {...props} /></QueryClientProvider>);

describe('integração W5 no detalhe de expedição', () => {
  it('mostra devolução para fatia entregue e cancelamento somente com residual', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Devolver itens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar saldo não entregue' })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma devolução registrada neste pedido.')).toBeInTheDocument();
  });

  it('não mostra cancelamento quando não existe saldo não entregue', () => {
    renderPanel({ remainingQuantity: 0 });
    expect(screen.queryByRole('button', { name: 'Cancelar saldo não entregue' })).not.toBeInTheDocument();
  });

  it('não adiciona complexidade quando a flag está fechada', () => {
    renderPanel({ access: { ...access, enabled: false } });
    expect(screen.queryByText('Pós-venda do pedido')).not.toBeInTheDocument();
  });
});
