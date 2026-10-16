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
    moduleRow('finance_advanced', 0),
    moduleRow('cobrancas', 150),
    moduleRow('pricing_advanced', 0),
    moduleRow('video_questions', 0),
    moduleRow('extra_user', 20),
    moduleRow('crm', 100),
    moduleRow('nfe', 150),
  ];

  it('inclui cinco usuários e cobra os excedentes pelo catálogo', () => {
    expect(sumModulesPrice(catalog, ['basic', 'customer_portal'], undefined, undefined, 5)).toBe(197);
  });

  it('soma módulos opcionais sem tratar extra_user como módulo marcável', () => {
    expect(sumModulesPrice(catalog, ['crm', 'extra_user'], undefined, undefined, 6)).toBe(317);
  });

  it('soma Cobranças como add-on pago quando selecionado', () => {
    expect(sumModulesPrice(catalog, ['cobrancas'], undefined, undefined, 5)).toBe(347);
  });

  it('cobra R$ 150 pelo nível inicial de Notas Fiscais no cadastro', () => {
    expect(sumModulesPrice(catalog, ['nfe'], undefined, undefined, 5)).toBe(347);
    expect(sumModulesPrice(
      catalog,
      ['nfe'],
      [{ tier: 1, name: 'Nível 1', monthlyLimit: 200, price: 150 }],
      1,
      5,
    )).toBe(347);
  });
});
