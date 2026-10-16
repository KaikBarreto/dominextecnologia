import { describe, expect, it } from 'vitest';
import { resolveNfseRepricedRenewalAmount } from '../../supabase/functions/_shared/nfse-base-reprice';

describe('renovação depois do reajuste de NFS-e', () => {
  it('usa a mensalidade-base reajustada no cartão', () => {
    expect(resolveNfseRepricedRenewalAmount({
      subscription_value: 347,
      billing_cycle: 'monthly',
    }, 'CREDIT_CARD')).toBe(347);
  });

  it('mantém promoção permanente e temporária enquanto estiverem ativas', () => {
    expect(resolveNfseRepricedRenewalAmount({
      subscription_value: 347,
      custom_price: 297,
      custom_price_permanent: true,
    }, 'PIX')).toBe(297);
    expect(resolveNfseRepricedRenewalAmount({
      subscription_value: 347,
      custom_price: 297,
      custom_price_months: 3,
      custom_price_payments_made: 2,
    }, 'PIX')).toBe(297);
  });

  it('volta à base reajustada quando a promoção termina', () => {
    expect(resolveNfseRepricedRenewalAmount({
      subscription_value: 347,
      custom_price: 297,
      custom_price_months: 3,
      custom_price_payments_made: 3,
    }, 'PIX')).toBe(347);
  });

  it('prioriza mudança pendente e calcula o anual à vista', () => {
    expect(resolveNfseRepricedRenewalAmount({
      subscription_value: 347,
      pending_subscription_value: 300,
      billing_cycle: 'monthly',
      pending_billing_cycle: 'yearly',
    }, 'PIX')).toBe(2880);
  });
});
