/**
 * Helpers de precificação de assinatura (Asaas).
 *
 * Regra de ouro: `pending_subscription_value` representa o PRÓXIMO valor da
 * mensalidade (depois que o admin agendou uma mudança). NUNCA deve ser usado
 * como valor a cobrar AGORA. Para cobrar a mensalidade corrente, use
 * `getEffectiveSubscriptionValue()`.
 *
 * Regra de preços (decisão B9, revisada pelo CEO em 2026-06-08):
 *   - Anual à vista (PIX/boleto): mensal × 12 × 0,80 → 20% de desconto.
 *   - Cartão de crédito: cobrança MENSAL recorrente, sem desconto anual e sem
 *     parcelamento. O cliente paga o mensal cheio todo mês ao longo do ano
 *     (não existe "anual no cartão" — o toggle anual só vale pra PIX/boleto).
 */

export type BillingCycle = "monthly" | "yearly";

export interface CompanyPricingFields {
  subscription_value?: number | null;
  custom_price?: number | null;
  custom_price_months?: number | null;
  custom_price_payments_made?: number | null;
  pending_subscription_value?: number | null;
}

/**
 * True se a empresa tem uma promoção temporária (`custom_price`) ainda ativa,
 * ou seja, ainda não pagou todas as mensalidades do período promocional.
 */
export function hasActiveCustomPrice(company: CompanyPricingFields): boolean {
  const cp = Number(company.custom_price) || 0;
  const months = Number(company.custom_price_months) || 0;
  const made = Number(company.custom_price_payments_made) || 0;
  return cp > 0 && months > 0 && made < months;
}

/**
 * Valor a cobrar AGORA (mensalidade corrente).
 * - Se promoção ativa: usa `custom_price`.
 * - Senão: usa `subscription_value`.
 *
 * NUNCA usa `pending_subscription_value` (que é o próximo valor, não o atual).
 */
export function getEffectiveSubscriptionValue(company: CompanyPricingFields): number {
  if (hasActiveCustomPrice(company)) {
    return Number(company.custom_price) || 0;
  }
  return Number(company.subscription_value) || 0;
}

/**
 * Valor que será cobrado a partir da PRÓXIMA mensalidade (quando o admin
 * agendou uma mudança de valor). Use só para exibir o aviso informativo
 * "Após pagar esta mensalidade, seu novo valor será R$ X".
 *
 * Retorna `null` se não há mudança agendada.
 */
export function getNextSubscriptionValue(company: CompanyPricingFields): number | null {
  const pending = Number(company.pending_subscription_value) || 0;
  return pending > 0 ? pending : null;
}

/**
 * Preço anual À VISTA (PIX/boleto): `mensal × 12 × 0,80` (20% off),
 * arredondado pra inteiro (round) — espelha o EcoSistema.
 * O badge "-20%" só vale pra esse caso.
 */
export function calculateYearlyPrice(monthlyPrice: number): number {
  return Math.round(monthlyPrice * 12 * 0.8);
}

/**
 * Preço anual SEM desconto (mensal × 12).
 *
 * Obs.: desde a revisão de B9 (2026-06-08), o cartão NÃO usa mais o anual cheio
 * (cartão = cobrança mensal recorrente). Mantido por compatibilidade/uso futuro.
 */
export function calculateYearlyPriceNoDiscount(monthlyPrice: number): number {
  return monthlyPrice * 12;
}

/**
 * Equivalente mensal de um valor anual (pra exibir "R$ X/mês" no card do plano).
 */
export function calculateMonthlyEquivalent(yearlyPrice: number): number {
  return yearlyPrice / 12;
}
