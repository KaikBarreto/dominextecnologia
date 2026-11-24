import { describe, expect, it } from 'vitest';
import {
  canInitializeRetailOffer, initialOfferSnapshotMatches, initialOfferSnapshot, normalizeInitialCompanyModules,
} from '../../supabase/functions/create-asaas-payment/billing-rules';

const company = {
  business_core: 'retail', business_core_version: 2, subscription_status: 'testing', trial_days: 7,
  subscription_plan: 'retail_start', subscription_value: 0, ltv: 0,
  custom_price: null, custom_price_permanent: false, updated_at: '2026-01-01T00:00:00Z',
};

describe('primeira oferta paga da Loja', () => {
  it('aceita apenas a conta nova sem contratação nem compromisso agendado', () => {
    expect(canInitializeRetailOffer(company)).toBe(true);
    expect(canInitializeRetailOffer({ ...company, subscription_value: 123 })).toBe(true);
  });
  it.each([
    { business_core: 'services' }, { business_core_version: 1 }, { subscription_status: 'active' },
    { subscription_status: 'pending_payment', trial_days: 0 }, { trial_days: 0 }, { trial_days: undefined },
    { subscription_value: -1 }, { subscription_value: null }, { custom_price: 40 }, { custom_price_permanent: true },
    { custom_price_months: 3 }, { custom_price_payments_made: 1 }, { pricing_adjustment_source: 'item_promotions' },
    { plan_locked: true }, { ltv: 1 }, { ltv: undefined }, { updated_at: null },
    { asaas_subscription_id: 'sub_fictitious' }, { pending_subscription_value: 30 },
    { pending_plan_code: 'retail_start' }, { pending_modules: [] }, { pending_max_users: 1 },
    { pending_billing_cycle: 'monthly' }, { pending_nfse_tier: 1 }, { pending_whatsapp_tier: 1 },
  ])('preserva contrato/promoção/legado ou estado desconhecido %j', patch => {
    expect(canInitializeRetailOffer({ ...company, ...patch })).toBe(false);
  });
  it.each(['renewal', 'upgrade'])('não inicializa durante %s', purpose => {
    expect(canInitializeRetailOffer(company, purpose)).toBe(false);
  });
  it('snapshot detecta preço, plano, promoção, cotação agendada e alterações de perfil', () => {
    expect(initialOfferSnapshotMatches(company, { ...company, asaas_customer_id: 'cus_fictitious' })).toBe(true);
    for (const patch of [{ subscription_value: 123 }, { subscription_plan: 'retail_master' },
      { custom_price: 10 }, { pending_plan_code: 'personalizado' }, { business_core: 'services' }, { max_users: 9 }]) {
      expect(initialOfferSnapshotMatches(company, { ...company, ...patch })).toBe(false);
    }
  });
  it('snapshot canônico compara presença e quantidade dos módulos, sem depender da ordem da leitura', () => {
    const first = initialOfferSnapshot(company, [{ module_code: 'service_operations', quantity: 1 }, { module_code: 'basic', quantity: null }]);
    expect(initialOfferSnapshotMatches(first, initialOfferSnapshot(company, [{ module_code: 'basic', quantity: null }, { module_code: 'service_operations', quantity: 1 }]))).toBe(true);
    expect(initialOfferSnapshotMatches(first, initialOfferSnapshot(company, [{ module_code: 'basic', quantity: null }]))).toBe(false);
    expect(initialOfferSnapshotMatches(first, initialOfferSnapshot(company, [{ module_code: 'basic', quantity: null }, { module_code: 'service_operations', quantity: 2 }]))).toBe(false);
    expect(() => normalizeInitialCompanyModules([{ module_code: 'basic' }])).toThrow();
  });
});
