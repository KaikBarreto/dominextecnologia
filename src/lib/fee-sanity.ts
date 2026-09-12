/**
 * Validação de sanidade da "Tarifa do recebimento" na aprovação de orçamento.
 *
 * Existe porque um tenant pagante digitou uma tarifa de R$ 6.600,00 sobre uma
 * venda de R$ 795,24 (830% da venda) e o sistema aceitou sem reclamar — o
 * campo (`ApproveQuoteModal`) nunca comparou a tarifa contra o valor da venda.
 *
 * Três níveis:
 * - `bloqueia`: tarifa >= valor da venda. Isso NUNCA é correto — ninguém paga
 *   uma tarifa de recebimento maior ou igual ao que está recebendo. Sempre
 *   erro de digitação (ex: confundir R$ 66,00 com R$ 6.600,00).
 * - `alerta`: tarifa alta mas plausível (acima do percentual configurável,
 *   padrão 20% da venda) — cartão de crédito parcelado ou boleto caro às
 *   vezes chega perto disso. Deixa seguir, mas avisa.
 * - `ok`: resto.
 *
 * Puro: sem React, sem Supabase, sem formatação de moeda (isso é do
 * chamador, que já tem `formatMoney` com locale/currency do tenant).
 */

export type FeeSanityLevel = 'ok' | 'alerta' | 'bloqueia';

export interface FeeSanityResult {
  level: FeeSanityLevel;
  /** Razão tarifa/venda, só quando a venda é > 0. `null` quando não dá pra calcular (venda <= 0). */
  ratio: number | null;
}

/** Percentual da venda a partir do qual a tarifa (ainda plausível) gera alerta. */
const ALERT_RATIO = 0.2;

/**
 * Avalia uma tarifa contra o valor bruto da venda.
 *
 * @param feeAmount valor digitado da tarifa (pode vir negativo ou zero de um
 *   campo de texto ainda sendo digitado — tratado como `ok`, sem incomodar
 *   quem só limpou o campo).
 * @param saleAmount valor bruto da venda (o `amount` do modal de aprovação).
 */
export function evaluateFeeSanity(feeAmount: number, saleAmount: number): FeeSanityResult {
  const fee = Number.isFinite(feeAmount) ? feeAmount : 0;
  const sale = Number.isFinite(saleAmount) ? saleAmount : 0;

  // Tarifa zero ou negativa nunca bloqueia nem alerta: campo vazio/zerado é o
  // estado normal antes de digitar, e negativo não é um caso real do formulário
  // (o Input é `inputMode="decimal"` sem sinal) — mas se vier, não é motivo pra
  // travar a venda por causa de uma tarifa, e sim tratar como ausência de tarifa.
  if (fee <= 0) return { level: 'ok', ratio: sale > 0 ? fee / sale : null };

  // Venda <= 0 não permite calcular proporção — não há como avaliar "tarifa
  // maior que a venda" sem venda. Não bloqueia por conta própria: o
  // `canSubmit` do modal já exige outros campos preenchidos.
  if (sale <= 0) return { level: 'ok', ratio: null };

  const ratio = fee / sale;

  if (fee >= sale) return { level: 'bloqueia', ratio };
  if (ratio > ALERT_RATIO) return { level: 'alerta', ratio };
  return { level: 'ok', ratio };
}
