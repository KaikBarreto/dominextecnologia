import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import { usePdvSale } from './usePdvSale';

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(usePdvSale, { wrapper }), client };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'order-1' }, error: null }) }) }),
  });
  mocks.rpc.mockResolvedValue({ data: { order_id: 'historic-order', idempotente: true }, error: null });
});

describe('novas vendas usam somente o writer v2', () => {
  it('barra também chamada direta ao criador antigo antes de inserir cabeçalho ou itens', async () => {
    const view = setup();
    try {
      await act(async () => {
        await expect(view.result.current.createOrder.mutateAsync({
          customerId: 'customer-1', terminalId: 'terminal-1', stockId: 'stock-1', cashSessionId: 'session-1', discountAmount: 0,
          items: [{ inventoryId: 'material-1', description: 'Material fictício', quantity: 1, unit: 'un', unitPrice: 10, unitCost: 5, discountAmount: 0 }],
        })).rejects.toThrow('Atualize a página e use a venda atual do PDV.');
      });
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    } finally { view.unmount(); view.client.clear(); }
  });

  it('preserva liquidação idempotente de pedido histórico já existente', async () => {
    const view = setup();
    try {
      await act(async () => {
        await expect(view.result.current.settleOrder.mutateAsync({
          orderId: 'historic-order', clientRequestId: 'historic-attempt', payments: [{ method: 'dinheiro', amount: 10 }],
        })).resolves.toMatchObject({ order_id: 'historic-order', idempotente: true });
      });
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('pdv_settle_order', {
        p_order_id: 'historic-order', p_client_request_id: 'historic-attempt', p_payments: [{ method: 'dinheiro', amount: 10 }], p_transaction_date: null,
      });
      expect(mocks.from).not.toHaveBeenCalled();
    } finally { view.unmount(); view.client.clear(); }
  });
});
