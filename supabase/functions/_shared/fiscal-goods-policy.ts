/** Política da ponte. Sem certificado, dados de clientes ou transporte fiscal. */
export const goodsPaymentCode = (value: unknown): string => {
  const codes: Record<string, string> = { cheque:'02', credito_loja:'05', vale_alimentacao:'10', vale_refeicao:'11', vale_presente:'12', vale_combustivel:'13', duplicata:'14', boleto:'15', deposito:'16', fidelidade:'19', pontos:'19', dinheiro: '01', pix: '17', credito: '03', cartao_credito: '03', debito: '04', cartao_debito: '04', transferencia: '18', fiado: '05', saldo_cliente: '05', voucher: '12' };
  return codes[String(value).toLowerCase()] ?? '99';
};
export function goodsOutcome(result: Record<string, unknown>) {
  const official = String(result.situacaoOficial ?? '');
  const outcome = String(result.outcome ?? '');
  if (official === 'cancelada' || outcome === 'cancelled') return { status: 'cancelled', official: 'cancelada' };
  if (official === 'autorizada' && ['denied','rejected'].includes(outcome)) return { status: 'uncertain', official: 'aguardando_confirmacao' };
  if (official === 'denegada' || ['denied', 'rejected'].includes(outcome)) return { status: 'rejected', official: official === 'denegada' ? official : null };
  if (official === 'autorizada' || outcome === 'authorized') return { status: 'authorized', official: 'autorizada' };
  return { status: 'uncertain', official: official || 'aguardando_confirmacao' };
}
export function sourceFinancialsMatch(draft: { items: Record<string, unknown>[]; payments: Record<string, unknown>[] }, orderTotal: number, sourceItems: Record<string, unknown>[], sourcePayments: Record<string, unknown>[]) {
  const cents = (n: unknown) => Math.round(Number(n) * 100);
  if (draft.items.length !== sourceItems.length || draft.payments.length !== sourcePayments.length) return false;
  const ids = new Set(draft.items.map(i => i.sourceItemId));
  if (ids.size !== sourceItems.length) return false;
  if (sourceItems.some(source => !draft.items.some(item => item.sourceItemId === source.id && item.inventoryId === source.inventory_id && Number(item.quantity) === Number(source.quantity) && Number(item.unitPrice) === Number(source.unit_price)))) return false;
  if (cents(draft.items.reduce((sum, i) => sum + Number(i.total), 0)) !== cents(orderTotal)) return false;
  const normalize = (rows: Record<string, unknown>[], source: boolean) => rows.map(p => `${source ? goodsPaymentCode(p.method) : p.method}:${cents(source ? Number(p.amount) + Number(p.change_amount) : p.amount)}:${cents(source ? p.change_amount : p.change)}`).sort();
  return JSON.stringify(normalize(draft.payments, false)) === JSON.stringify(normalize(sourcePayments, true));
}
