import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { invalidatePdvReportCaches } from '@/hooks/pdvReportCache';

/**
 * Leituras operacionais derivadas do estado canônico de um pedido.
 *
 * O cancelamento preserva o pedido no histórico como cancelado. Estas raízes
 * apenas impedem que filas e projeções antigas continuem mostrando a venda
 * como ativa depois de `pdv_cancel_order_v2` confirmar o estorno.
 */
export const PDV_ORDER_CANCELLATION_QUERY_ROOTS = [
  ['pdv', 'orders-workspace'],
  ['pdv-orders'],
  ['pdv-sales-flow'],
  ['pdv-dispatch'],
  ['pdv-counter'],
  ['pdv-cash'],
  ['pdv-cash-sessions'],
  ['pdv-cash-session-operators'],
  ['pdv-cofre-balance'],
  ['pdv-cash-session-detail'],
  ['pdv-cash-sessions-v2'],
  ['inventory'],
  ['accessible-inventory-ids'],
  ['inventory-stock-levels'],
  ['inventory-movements'],
  ['pdv-stock-availability'],
  ['pdv-stock-reservations'],
  ['financial-accounts'],
  ['account-balances'],
  ['financial-transactions'],
  ['financial-summary'],
  ['pdv-customer-credit'],
  ['pdv-customer-payment-options'],
  ['party-account'],
  ['party-account-v2'],
  ['pdv-returns'],
  ['pdv-after-sale-v2'],
] as const satisfies readonly QueryKey[];

/** Invalidação canônica compartilhada por todos os pontos de cancelamento. */
export async function invalidatePdvOrderCancellationCaches(queryClient: QueryClient) {
  await Promise.all([
    ...PDV_ORDER_CANCELLATION_QUERY_ROOTS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
    invalidatePdvReportCaches(queryClient),
  ]);
}
