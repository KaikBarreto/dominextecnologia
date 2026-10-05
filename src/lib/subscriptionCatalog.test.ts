import { describe, expect, it } from 'vitest';
import {
  REQUIRED_CUSTOM_MODULE_CODES,
  resolveExtraUserPrice,
  withRequiredCustomModules,
} from './subscriptionCatalog';

describe('subscriptionCatalog', () => {
  it('mantém basic e customer_portal obrigatórios sem duplicá-los', () => {
    expect(withRequiredCustomModules(['crm', 'basic', 'customer_portal', 'crm'])).toEqual([
      ...REQUIRED_CUSTOM_MODULE_CODES,
      'crm',
    ]);
  });

  it('usa o preço de extra_user do catálogo', () => {
    expect(resolveExtraUserPrice([
      { code: 'basic', price: 197 },
      { code: 'extra_user', price: 65 },
    ])).toBe(65);
  });

  it.each([undefined, null, 0, -10, Number.NaN])(
    'falha fechado para preço de usuário adicional inválido: %s',
    (price) => {
      expect(resolveExtraUserPrice([{ code: 'extra_user', price }])).toBeNull();
    },
  );
});
