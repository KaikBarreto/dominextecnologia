import { describe, expect, it } from 'vitest';
import { sumModulesPrice, type SubscriptionModule } from './ModuleGrid';

const moduleRow = (code: string, price: number): SubscriptionModule => ({
  code,
  name: code,
  price,
  description: null,
  type: 'module',
  sort_order: 1,
});

describe('preço do plano personalizado no painel master', () => {
  const catalog = [
    moduleRow('basic', 197),
    moduleRow('customer_portal', 0),
    moduleRow('extra_user', 50),
    moduleRow('crm', 100),
  ];

  it('inclui dois usuários e cobra os excedentes pelo catálogo', () => {
    expect(sumModulesPrice(catalog, ['basic', 'customer_portal'], undefined, undefined, 5)).toBe(347);
  });

  it('soma módulos opcionais sem tratar extra_user como módulo marcável', () => {
    expect(sumModulesPrice(catalog, ['crm', 'extra_user'], undefined, undefined, 3)).toBe(347);
  });
});
