export type AsaasBillingType = "PIX" | "CREDIT_CARD" | "BOLETO";
export type BillingCycle = "monthly" | "yearly";

export interface ChargeTerms {
  billingCycle: BillingCycle;
  asaasCycle: "MONTHLY" | "YEARLY";
  pixAutomaticFrequency: "MONTHLY" | "ANNUALLY";
  expectedAmount: number;
  gatewayAmount: number;
}

/**
 * Resolve a regra financeira antes de qualquer payload ser enviado ao gateway.
 *
 * Cartão é sempre uma assinatura mensal: um `billing_cycle=yearly` vindo do
 * cliente não pode mudar nem o ciclo nem o valor mensal reconciliado no banco.
 * PIX/boleto preservam a cobrança anual à vista já existente (12 meses - 20%).
 */
export function resolveChargeTerms(
  billingType: AsaasBillingType,
  requestedCycle: BillingCycle | undefined,
  monthlyBase: number,
  requestedAmount: number,
): ChargeTerms {
  const billingCycle: BillingCycle = billingType === "CREDIT_CARD"
    ? "monthly"
    : requestedCycle === "yearly"
    ? "yearly"
    : "monthly";

  const isAnnualCashPayment = billingType !== "CREDIT_CARD" && billingCycle === "yearly";
  const expectedAmount = isAnnualCashPayment
    ? Math.round(monthlyBase * 12 * 0.8)
    : monthlyBase;

  return {
    billingCycle,
    asaasCycle: billingCycle === "yearly" ? "YEARLY" : "MONTHLY",
    pixAutomaticFrequency: billingCycle === "yearly" ? "ANNUALLY" : "MONTHLY",
    expectedAmount,
    // Só o cartão ignora o valor controlado pelo cliente e usa diretamente a
    // base mensal reconciliada. PIX/boleto mantêm o valor aceito pela tolerância
    // existente, evitando alterar sua formação nesta correção focada.
    gatewayAmount: billingType === "CREDIT_CARD" ? expectedAmount : requestedAmount,
  };
}
