export type AsaasBillingType = "PIX" | "CREDIT_CARD" | "BOLETO";
export type BillingCycle = "monthly" | "yearly";

export interface ChargeTerms {
  billingCycle: BillingCycle;
  asaasCycle: "MONTHLY" | "YEARLY";
  pixAutomaticFrequency: "MONTHLY" | "ANNUALLY";
  expectedAmount: number;
  gatewayAmount: number;
}

export type InitialOfferCompany = Record<string, unknown>;
const INITIAL_STATUSES = new Set(["testing", "Testando", "trial"]);

/** Só a conta Loja nova e ainda sem contratação pode formar sua primeira oferta. */
export function canInitializeRetailOffer(company: InitialOfferCompany, purpose?: string): boolean {
  return purpose == null
    && company.business_core === "retail"
    && company.business_core_version === 2
    && INITIAL_STATUSES.has(String(company.subscription_status))
    && Number.isFinite(Number(company.trial_days)) && Number(company.trial_days) > 0
    && company.subscription_value != null && Number.isFinite(Number(company.subscription_value)) && Number(company.subscription_value) >= 0
    && Number(company.ltv) === 0
    && company.custom_price == null
    && company.custom_price_permanent !== true
    && Number(company.custom_price_months ?? 0) === 0
    && Number(company.custom_price_payments_made ?? 0) === 0
    && company.pricing_adjustment_source == null
    && company.plan_locked !== true
    && !company.asaas_subscription_id
    && typeof company.updated_at === "string"
    && ["pending_subscription_value", "pending_plan_code", "pending_billing_cycle", "pending_modules",
      "pending_max_users", "pending_nfse_tier", "pending_whatsapp_tier"].every(key => company[key] == null);
}

// O snapshot comercial permanece estável até a cobrança. IDs de transporte
// e updated_at ficam fora: o próprio gateway pode vinculá-los neste fluxo.
export const INITIAL_OFFER_SNAPSHOT_FIELDS = [
  "business_core", "business_core_version", "subscription_status", "subscription_plan", "subscription_value",
  "max_users", "extra_users", "ltv", "custom_price", "custom_price_permanent", "custom_price_months",
  "custom_price_payments_made", "pricing_adjustment_source", "plan_locked", "billing_cycle",
  "subscription_expires_at", "pending_subscription_value", "pending_plan_code",
  "pending_billing_cycle", "pending_modules", "pending_max_users", "pending_nfse_tier", "pending_whatsapp_tier",
  "nfse_tier", "whatsapp_tier", "trial_days", "origin", "company_modules",
] as const;

export function normalizeInitialCompanyModules(value: unknown): Array<{ module_code: string; quantity: number | null }> {
  if (!Array.isArray(value)) throw new Error('Não foi possível conferir os módulos da empresa.');
  return value.map(row => {
    if (!row || typeof row !== 'object' || typeof row.module_code !== 'string' || !row.module_code
      || !('quantity' in row) || (row.quantity !== null && (!Number.isSafeInteger(row.quantity) || row.quantity < 0))) {
      throw new Error('Não foi possível conferir os módulos da empresa.');
    }
    return { module_code: row.module_code, quantity: row.quantity as number | null };
  }).sort((a, b) => a.module_code < b.module_code ? -1 : a.module_code > b.module_code ? 1 : 0);
}

export function initialOfferSnapshot(company: InitialOfferCompany, modules: unknown = company.company_modules ?? []): InitialOfferCompany {
  return { ...Object.fromEntries(INITIAL_OFFER_SNAPSHOT_FIELDS.filter(key => key !== 'company_modules')
    .map(key => [key, company[key] ?? null])), company_modules: normalizeInitialCompanyModules(modules) };
}

export function initialOfferSnapshotMatches(expected: InitialOfferCompany, actual: InitialOfferCompany): boolean {
  return INITIAL_OFFER_SNAPSHOT_FIELDS.every(key => JSON.stringify(expected[key]) === JSON.stringify(actual[key]));
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
