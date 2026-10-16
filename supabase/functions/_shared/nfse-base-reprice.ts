export interface NfseRepricedCompanyBilling {
  subscription_value?: number | string | null;
  pending_subscription_value?: number | string | null;
  billing_cycle?: string | null;
  pending_billing_cycle?: string | null;
  custom_price?: number | string | null;
  custom_price_permanent?: boolean | null;
  custom_price_months?: number | string | null;
  custom_price_payments_made?: number | string | null;
}

function positiveMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Valor que a próxima cobrança recorrente deve ter depois do reajuste da NFS-e.
 * Espelha a precedência do checkout: mudança pendente > promoção ativa > base.
 * Cartão continua mensal; Pix/boleto anual recebe os 20% comerciais existentes.
 */
export function resolveNfseRepricedRenewalAmount(
  company: NfseRepricedCompanyBilling,
  billingType: unknown,
): number | null {
  const pendingValue = positiveMoney(company.pending_subscription_value);
  const customPrice = positiveMoney(company.custom_price);
  const customMonths = Number(company.custom_price_months) || 0;
  const customPaymentsMade = Number(company.custom_price_payments_made) || 0;
  const hasActiveCustomPrice = customPrice > 0 && (
    company.custom_price_permanent === true
    || (customMonths > 0 && customPaymentsMade < customMonths)
  );
  const monthlyBase = pendingValue > 0
    ? pendingValue
    : hasActiveCustomPrice
      ? customPrice
      : positiveMoney(company.subscription_value);

  if (!(monthlyBase > 0)) return null;

  const normalizedBillingType = String(billingType || '').toUpperCase();
  const targetCycle = pendingValue > 0 && company.pending_billing_cycle
    ? company.pending_billing_cycle
    : company.billing_cycle;
  const isAnnualCash = normalizedBillingType !== 'CREDIT_CARD' && targetCycle === 'yearly';
  return isAnnualCash
    ? roundMoney(monthlyBase * 12 * 0.8)
    : roundMoney(monthlyBase);
}
