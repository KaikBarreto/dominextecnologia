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
