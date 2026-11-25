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
/**
 * cStat 539 ("duplicidade com diferença na chave"): a SEFAZ recusou o envio porque
 * o NÚMERO já pertence a outra nota. Sozinho ele não prova nada sobre a nossa chave,
 * então só vira rejeição definitiva quando a consulta DESTA chave responde que ela
 * não existe. Sem essa regra a nota ficava "consultando" para sempre: a consulta
 * nunca acha uma chave que a SEFAZ recusou.
 */
export function goodsNumberCollision(transmissionCstat: unknown, consultedOfficial: unknown): boolean {
  return String(transmissionCstat ?? '') === '539' && String(consultedOfficial ?? '') === 'nao_localizada';
}
export function goodsRejectionMessage(cstat: unknown): string {
  return String(cstat ?? '') === '539'
    ? 'A SEFAZ recusou a nota porque este número já foi usado em outra nota da empresa. Ajuste a numeração da série e emita novamente.'
    : 'Documento rejeitado pela SEFAZ. Revise o cadastro fiscal.';
}
/** Rateio em centavos por maior resto; a ordem original desempata. Nunca deixa item negativo. */
export function canonicalGoodsSourceTotals(items: Record<string, unknown>[], orderTotal: number): number[] | null {
  const cents = (value: unknown) => Math.round(Number(value) * 100);
  const totals = items.map(i => cents(i.total)); const target = cents(orderTotal);
  if (!Number.isSafeInteger(target) || target < 0 || totals.some(n => !Number.isSafeInteger(n) || n < 0)) return null;
  const sum = totals.reduce((n,value) => n+value,0);
  if (!Number.isSafeInteger(sum) || target > sum) return null;
  if (!sum) return totals.map(() => 0);
  const discount = BigInt(sum-target); const denominator = BigInt(sum);
  const shares = totals.map((value,index) => ({index, cents:Number(discount*BigInt(value)/denominator), remainder:discount*BigInt(value)%denominator}));
  let pending = sum-target-shares.reduce((n,s) => n+s.cents,0);
  const ranked = [...shares].sort((a,b) => a.remainder === b.remainder ? a.index-b.index : a.remainder>b.remainder ? -1 : 1);
  for (const entry of ranked) { if (!pending) break; entry.cents++; pending--; }
  if (pending) return null;
  return totals.map((value,index) => (value-shares[index].cents)/100);
}
export function sourceFinancialsMatch(draft: { items: Record<string, unknown>[]; payments: Record<string, unknown>[] }, orderTotal: number, sourceItems: Record<string, unknown>[], sourcePayments: Record<string, unknown>[]) {
  const cents = (n: unknown) => Math.round(Number(n) * 100);
  if (draft.items.length !== sourceItems.length || draft.payments.length !== sourcePayments.length) return false;
  const ids = new Set(draft.items.map(i => i.sourceItemId));
  if (ids.size !== sourceItems.length) return false;
  const expectedTotals = canonicalGoodsSourceTotals(sourceItems,orderTotal);
  if (!expectedTotals) return false;
  if (sourceItems.some((source,index) => !draft.items.some(item => item.sourceItemId === source.id && item.inventoryId === source.inventory_id && Number(item.quantity) === Number(source.quantity) && Number(item.unitPrice) === Number(source.unit_price) && cents(item.total) === cents(expectedTotals[index])))) return false;
  if (cents(draft.items.reduce((sum, i) => sum + Number(i.total), 0)) !== cents(orderTotal)) return false;
  const normalize = (rows: Record<string, unknown>[], source: boolean) => rows.map(p => `${source ? goodsPaymentCode(p.method) : p.method}:${cents(source ? Number(p.amount) + Number(p.change_amount) : p.amount)}:${cents(source ? p.change_amount : p.change)}:${source ? p.method === 'fiado' : p.deferred === true}`).sort();
  return JSON.stringify(normalize(draft.payments, false)) === JSON.stringify(normalize(sourcePayments, true));
}
