export type MetricTrend = { percent: number | null; direction: 'up' | 'down' | 'flat' | 'new' };

/** Comparação segura: base zero nunca vira Infinity nem uma porcentagem enganosa. */
export function compareMetric(current: number, previous: number): MetricTrend {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return { percent: null, direction: 'flat' };
  if (previous === 0) return current === 0
    ? { percent: 0, direction: 'flat' }
    : { percent: null, direction: 'new' };
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  return { percent, direction: percent > 0.005 ? 'up' : percent < -0.005 ? 'down' : 'flat' };
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  transferencia: 'Transferência',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  fiado: 'Fiado',
  pontos: 'Pontos',
  voucher: 'Vale',
  saldo_cliente: 'Saldo do cliente',
  credito_loja: 'Crédito da loja',
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? 'Outra forma';
}
