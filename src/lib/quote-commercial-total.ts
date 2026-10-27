/**
 * Valor que o cliente paga pelo orcamento.
 *
 * `total_price` e uma sugestao interna calculada por custo/BDI. Registros
 * antigos podem nao ter `total_value`, por isso `total_price` fica apenas como
 * fallback, nunca como precedencia.
 */
export function getQuoteCommercialTotal(quote: {
  total_value?: number | null;
  total_price?: number | null;
} | null | undefined): number {
  return Number(quote?.total_value ?? quote?.total_price ?? 0);
}

export function calculateCommercialPaymentOptions(
  commercialTotal: number,
  cashDiscountRate: number,
  cardInstallments: number,
) {
  const total = Math.max(0, Number(commercialTotal) || 0);
  const discountRate = Math.min(100, Math.max(0, Number(cashDiscountRate) || 0));
  const installments = Math.max(1, Math.floor(Number(cardInstallments) || 1));

  return {
    cashPrice: total * (1 - discountRate / 100),
    installmentValue: total / installments,
    cashDiscountRate: discountRate,
    cardInstallments: installments,
  };
}
