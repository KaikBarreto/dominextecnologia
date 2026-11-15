/** Estado operacional único; os estados financeiro e de entrega continuam no detalhe. */
export interface PdvOrderStateInput {
  commercialStatus: string;
  paymentStatus: string;
  pickupStatus: string;
}
export function pdvOrderCurrentState(order: PdvOrderStateInput) {
  if (order.commercialStatus === 'cancelado') return { label: 'Cancelado', tone: 'bg-red-600' };
  if (order.commercialStatus === 'cancelado_parcial') return { label: 'Cancelado parcialmente', tone: 'bg-orange-600' };
  if (order.paymentStatus === 'cancelado') return { label: 'Pagamento cancelado', tone: 'bg-red-600' };
  if (order.paymentStatus === 'reembolsado') return { label: 'Reembolsado', tone: 'bg-violet-700' };
  if (order.paymentStatus === 'reembolso_parcial') return { label: 'Reembolso parcial', tone: 'bg-violet-700' };
  if (order.pickupStatus === 'entregue' || order.commercialStatus === 'entregue') return { label: 'Entregue', tone: 'bg-emerald-800' };
  if (order.pickupStatus === 'parcial' || order.commercialStatus === 'retirada_parcial') return { label: 'Retirada parcial', tone: 'bg-amber-800' };
  if (order.pickupStatus === 'liberado' || order.commercialStatus === 'liberado_retirada') return { label: 'Aguardando retirada', tone: 'bg-blue-800' };
  if (order.commercialStatus === 'rascunho') return { label: 'Rascunho', tone: 'bg-slate-700' };
  if (order.paymentStatus === 'parcial') return { label: 'Pagamento parcial', tone: 'bg-amber-800' };
  if (order.paymentStatus === 'fiado_aprovado') return { label: 'Fiado aprovado', tone: 'bg-emerald-800' };
  if (order.paymentStatus === 'pago' || order.commercialStatus === 'pago') return { label: 'Pago', tone: 'bg-emerald-800' };
  return { label: 'Aguardando pagamento', tone: 'bg-slate-700' };
}

/** Um legado pago não comprova retirada separada: somente estados explícitos a indicam. */
export function pdvOrderHasSeparatePickup(order: PdvOrderStateInput) {
  return ['liberado', 'parcial'].includes(order.pickupStatus)
    || ['liberado_retirada', 'retirada_parcial'].includes(order.commercialStatus);
}
