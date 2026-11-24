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

export type GoodsDocumentRecoveryAction = 'revise' | 'resume' | 'reissue';

/** A interface mantém a rejeitada imutável e cria uma nova tentativa com nova numeração. */
export function goodsDocumentRecovery(document: Record<string,unknown>, now = Date.now()): {action:GoodsDocumentRecoveryAction;label:string} | null {
  if (document.status === 'signed' && typeof document.access_key === 'string' && /^\d{44}$/.test(document.access_key)) return {action:'resume',label:'Continuar emissão'};
  if (document.status === 'rejected') return {action:'reissue',label:'Corrigir e reemitir'};
  if (document.access_key) return null;
  const age = now - new Date(String(document.updated_at ?? '')).getTime();
  if (document.status === 'preparing' && Number.isFinite(age) && age >= 300_000) return {action:'revise',label:'Retomar rascunho'};
  return null;
}

export function cloneGoodsDraftForReissue(payload: unknown): Record<string, unknown> {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const clone = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  for (const key of ['number', 'numero', 'accessKey', 'access_key', 'chave', 'protocol', 'protocolo', 'operationId', 'operation_id']) delete clone[key];
  clone.id = null;
  return clone;
}
