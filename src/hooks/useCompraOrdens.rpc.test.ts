import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  toast: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'company-1' } }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/hooks/useMaterialPurchaseReport', () => ({ MATERIAL_PURCHASE_REPORT_QUERY_KEY: ['material-purchase-report'] }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: (options: unknown) => ({ __options: options }),
}));
vi.mock('@/integrations/supabase/client', async () => {
  const { SupabaseClient } = await import('@supabase/supabase-js');
  return {
    supabase: {
      from: mocks.from,
      rpc: SupabaseClient.prototype.rpc,
      rest: { rpc: (name: string, args: Record<string, unknown>) => mocks.rpc(name, args) },
    },
  };
});

import { useCompraOrdens } from './useCompraOrdens';

type ReceiptInput = { ordemId: string; itens: { item_id: string; quantity: number }[] };
function useReceiptOptions() {
  return (useCompraOrdens('purchase-1').receber as unknown as {
    __options: { mutationFn: (input: ReceiptInput) => Promise<void> };
  }).__options;
}

describe('recebimento de compra — método real do SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it('envia os itens válidos uma vez pela função atômica de recebimento', async () => {
    await useReceiptOptions().mutationFn({
      ordemId: 'order-1',
      itens: [{ item_id: 'item-1', quantity: 3 }, { item_id: 'item-2', quantity: 0 }],
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('inventory_receive_purchase_order_v3', {
      p_ordem_id: 'order-1', p_itens: [{ item_id: 'item-1', quantity: 3 }],
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('propaga recusa de permissão sem repetir o recebimento', async () => {
    const error = { code: '42501', message: 'Operação não permitida' };
    mocks.rpc.mockResolvedValueOnce({ data: null, error });
    await expect(useReceiptOptions().mutationFn({
      ordemId: 'order-1', itens: [{ item_id: 'item-1', quantity: 3 }],
    })).rejects.toBe(error);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('recusa recebimento vazio antes de chamar o servidor', async () => {
    await expect(useReceiptOptions().mutationFn({ ordemId: 'order-1', itens: [] })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
