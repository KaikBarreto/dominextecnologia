export type CompanyLifecycleColumn = 'active' | 'testing' | 'inactive' | 'former_customer';

export type CompanyLifecycleSource = {
  subscription_status?: string | null;
  ltv?: number | string | null;
  has_payment_history?: boolean;
};

/**
 * Classificacao comercial derivada: ex-cliente continua com status tecnico
 * `inactive`, mas ja possui receita confirmada acumulada no servidor.
 */
export function hasPaidSubscription(company: CompanyLifecycleSource): boolean {
  const ltv = Number(company.ltv ?? 0);
  return company.has_payment_history === true || (Number.isFinite(ltv) && ltv > 0);
}

export function getCompanyLifecycleColumn(company: CompanyLifecycleSource): CompanyLifecycleColumn | string {
  if (company.subscription_status === 'inactive' && hasPaidSubscription(company)) {
    return 'former_customer';
  }

  return company.subscription_status ?? 'inactive';
}
