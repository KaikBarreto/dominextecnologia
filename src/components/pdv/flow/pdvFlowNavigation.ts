import type { PdvSalesFlowCardModel } from '@/hooks/usePdvSalesFlow';

export interface PdvFlowScreenAccess {
  pdv: boolean;
  orders: boolean;
  dispatch: boolean;
}

/** Resolve somente destinos que o perfil pode abrir; expedição continua operacional. */
export function pdvFlowCardDestination(card: PdvSalesFlowCardModel, access: PdvFlowScreenAccess): string | null {
  const preorder = card.preorderId && (access.pdv || access.orders)
    ? `/pdv/pre-pedidos?orcamento=${encodeURIComponent(card.preorderId)}` : null;
  if (card.stage === 'draft' || card.stage === 'cash' && !card.orderId) return preorder;
  if (!card.orderId) return preorder;
  const orderId = encodeURIComponent(card.orderId);
  if (card.stage === 'cash' && access.pdv) return `/pdv?fila=1&pedido=${orderId}`;
  if ((card.stage === 'pickup' || card.stage === 'partial') && access.dispatch) return `/pdv/expedicao?pedido=${orderId}`;
  if (access.orders) return `/pdv/pedidos?pedido=${orderId}`;
  if (access.dispatch && card.stage === 'completed') return `/pdv/expedicao?pedido=${orderId}`;
  return preorder;
}
