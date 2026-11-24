import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  invalidatePdvOrderCancellationCaches,
  PDV_ORDER_CANCELLATION_QUERY_ROOTS,
} from './pdvOrderCancellationCache';

describe('invalidação canônica do cancelamento de pedido PDV', () => {
  it('atualiza todas as projeções operacionais depois do cancelamento', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

    await invalidatePdvOrderCancellationCaches(client);

    for (const queryKey of PDV_ORDER_CANCELLATION_QUERY_ROOTS) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pdv', 'reports-v2'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['material-purchase-report'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'abc-report'] });
  });

  it('não repete raízes e preserva as famílias críticas de histórico e operação', () => {
    const serialized = PDV_ORDER_CANCELLATION_QUERY_ROOTS.map((queryKey) => JSON.stringify(queryKey));

    expect(new Set(serialized).size).toBe(serialized.length);
    expect(serialized).toEqual(expect.arrayContaining([
      JSON.stringify(['pdv', 'orders-workspace']),
      JSON.stringify(['pdv-orders']),
      JSON.stringify(['pdv-sales-flow']),
      JSON.stringify(['pdv-dispatch']),
      JSON.stringify(['pdv-counter']),
      JSON.stringify(['pdv-cash-sessions-v2']),
      JSON.stringify(['inventory']),
      JSON.stringify(['financial-transactions']),
      JSON.stringify(['pdv-customer-payment-options']),
      JSON.stringify(['party-account-v2']),
      JSON.stringify(['pdv-returns']),
      JSON.stringify(['pdv-after-sale-v2']),
    ]));
  });
});
