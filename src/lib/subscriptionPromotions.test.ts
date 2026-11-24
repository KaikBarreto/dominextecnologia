import { describe, expect, it } from 'vitest';
import {
  calculatePromotionalMonthlyValue,
  isPromotionDraftValid,
  remainingPromotionCycles,
  toPromotionPayload,
  type SubscriptionPromotionDraft,
} from './subscriptionPromotions';

const promotion = (patch: Partial<SubscriptionPromotionDraft> = {}): SubscriptionPromotionDraft => ({
  scope_type: 'module',
  module_code: 'contracts',
  quantity: 1,
  standard_unit_price: 50,
  promotional_unit_price: 0,
  billing_cycles: 3,
  consumed_cycles: 0,
  reason: '',
  ...patch,
});

describe('promoções itemizadas da assinatura', () => {
  it('aceita módulo gratuito sem zerar a mensalidade base', () => {
    expect(calculatePromotionalMonthlyValue(223.5, [promotion()])).toBe(173.5);
  });

  it('soma descontos simultâneos de módulo e usuários', () => {
    expect(calculatePromotionalMonthlyValue(263.5, [
      promotion(),
      promotion({
        scope_type: 'extra_users',
        module_code: null,
        quantity: 2,
        standard_unit_price: 20,
        promotional_unit_price: 10,
      }),
    ])).toBe(193.5);
  });

  it('ignora promoção que já consumiu todas as cobranças', () => {
    const completed = promotion({ consumed_cycles: 3 });
    expect(remainingPromotionCycles(completed)).toBe(0);
    expect(calculatePromotionalMonthlyValue(223.5, [completed])).toBe(223.5);
  });

  it('normaliza o payload sem descartar preço promocional zero', () => {
    expect(toPromotionPayload([promotion({ id: 'promo-1', reason: ' Fidelização ' })])).toEqual([{
      id: 'promo-1',
      scope_type: 'module',
      module_code: 'contracts',
      quantity: 1,
      promotional_unit_price: 0,
      billing_cycles: 3,
      reason: 'Fidelização',
    }]);
  });

  it('rejeita preço promocional acima do valor normal', () => {
    expect(isPromotionDraftValid(promotion({ promotional_unit_price: 51 }))).toBe(false);
    expect(isPromotionDraftValid(promotion())).toBe(true);
  });
});
