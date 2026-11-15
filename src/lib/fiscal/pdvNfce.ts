export const PDV_NFCE_STATUS: Record<string, string> = {
  draft: 'Rascunho', queued: 'Na fila', preparing: 'Preparando', signed: 'Assinada', transmitting: 'Transmitindo',
  uncertain: 'Situação incerta — consultar', authorized: 'Autorizada', rejected: 'Rejeitada',
  cancellation_pending: 'Cancelamento em consulta', cancelled: 'Cancelada',
};
export function pdvNfceStatus(status: unknown) { return typeof status === 'string' ? PDV_NFCE_STATUS[status] ?? 'Situação indisponível' : 'Não solicitada'; }
/** Automático só poderá ganhar fonte única de disparo em entrega posterior ao canário. */
export function shouldAskPdvNfce(enabled: boolean, mode: string, confirmed: boolean, exists: boolean) {
  return confirmed && enabled && mode === 'ask' && !exists;
}

export function isPdvNfceSaleConfirmed(status: unknown) {
  return typeof status === 'string' && ['pago','liberado_retirada','retirada_parcial','entregue'].includes(status);
}

export function goodsPaymentLabel(method: string) {
  const labels: Record<string,string> = {'01':'Dinheiro','02':'Cheque','03':'Cartão de crédito','04':'Cartão de débito','05':'Crédito da loja / saldo / fiado','10':'Vale-alimentação','11':'Vale-refeição','12':'Vale-presente / voucher','13':'Vale-combustível','14':'Duplicata','15':'Boleto','16':'Depósito','17':'Pix','18':'Transferência','19':'Pontos / fidelidade','90':'Sem pagamento','99':'Outros'};
  return labels[method] ?? 'Outro meio de pagamento';
}
