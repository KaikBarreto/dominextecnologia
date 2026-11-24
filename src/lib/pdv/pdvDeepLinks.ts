/**
 * Aceita o contrato atual (`pedido`) e o legado emitido pelos relatórios
 * (`order`). Novos links devem sempre usar `pedido`.
 */
export function resolveRequestedPdvOrderId(params: URLSearchParams): string | null {
  return params.get('pedido') ?? params.get('order');
}
