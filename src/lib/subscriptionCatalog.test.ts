import { describe, expect, it } from 'vitest';
import {
  EXCEPTION_PLAN_CODE,
  REQUIRED_CUSTOM_MODULE_CODES,
  planAllowsScreen,
  resolveExtraUserPrice,
  withRequiredCustomModules,
} from './subscriptionCatalog';

describe('subscriptionCatalog', () => {
  it('mantém todos os recursos da base obrigatórios sem duplicá-los', () => {
    expect(withRequiredCustomModules([
      'crm',
      'basic',
      'customer_portal',
      'pricing_advanced',
      'video_questions',
      'crm',
    ])).toEqual([
      ...REQUIRED_CUSTOM_MODULE_CODES,
      'crm',
    ]);
  });

  it('usa o preço de extra_user do catálogo', () => {
    expect(resolveExtraUserPrice([
      { code: 'basic', price: 197 },
      { code: 'extra_user', price: 20 },
    ])).toBe(20);
  });

  it.each([undefined, null, 0, -10, Number.NaN])(
    'falha fechado para preço de usuário adicional inválido: %s',
    (price) => {
      expect(resolveExtraUserPrice([{ code: 'extra_user', price }])).toBeNull();
    },
  );

  it('limita Orçamentos e Financeiro somente no plano Exceção', () => {
    expect(planAllowsScreen(EXCEPTION_PLAN_CODE, 'screen:quotes')).toBe(false);
    expect(planAllowsScreen(EXCEPTION_PLAN_CODE, 'screen:finance')).toBe(false);
    expect(planAllowsScreen(EXCEPTION_PLAN_CODE, 'screen:service_orders')).toBe(true);
    expect(planAllowsScreen('start', 'screen:quotes')).toBe(true);
  });
});
