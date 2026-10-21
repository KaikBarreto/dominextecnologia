import { describe, expect, it } from 'vitest';
import {
  EXCEPTION_PLAN_CODE,
  BASIC_BUNDLE_FEATURES,
  REQUIRED_CUSTOM_MODULE_CODES,
  buildCommercialModuleFeatures,
  isRetiredProposalModule,
  planAllowsScreen,
  resolveExtraUserPrice,
  resolveProposalWhatsappPrice,
  withRequiredCustomModules,
} from './subscriptionCatalog';

describe('subscriptionCatalog', () => {
  it('mantém todos os recursos da base obrigatórios sem duplicá-los', () => {
    expect(withRequiredCustomModules([
      'crm',
      'basic',
      'customer_portal',
      'cobrancas',
      'pricing_advanced',
      'video_questions',
      'crm',
    ])).toEqual([
      ...REQUIRED_CUSTOM_MODULE_CODES,
      'crm',
      'cobrancas',
    ]);
  });

  it('mantém Cobranças fora da base obrigatória para ser um add-on pago', () => {
    expect(REQUIRED_CUSTOM_MODULE_CODES).not.toContain('cobrancas');
  });

  it('agrupa entitlements internos da base e lista somente add-ons comerciais', () => {
    expect(buildCommercialModuleFeatures(
      ['basic', 'customer_portal', 'finance_advanced', 'pricing_advanced', 'video_questions', 'crm'],
      [{ code: 'crm', name: 'CRM Completo' }],
    )).toEqual([...BASIC_BUNDLE_FEATURES, 'CRM Completo']);
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

  it('usa o primeiro nível pago de WhatsApp na proposta comercial', () => {
    expect(resolveProposalWhatsappPrice([
      { tier: 3, price: 119 },
      { tier: 1, price: 0 },
      { tier: 2, price: 49 },
    ])).toEqual({ tier: 2, price: 49 });
  });

  it('falha fechado quando não existe nível pago de WhatsApp válido', () => {
    expect(resolveProposalWhatsappPrice([
      { tier: 1, price: 0 },
      { tier: 2, price: Number.NaN },
    ])).toBeNull();
  });

  it('aposenta somente o antigo Financeiro Avançado na proposta', () => {
    expect(isRetiredProposalModule('finance_advanced')).toBe(true);
    expect(isRetiredProposalModule('cobrancas')).toBe(false);
    expect(isRetiredProposalModule('finance')).toBe(false);
  });

  it('limita Orçamentos e Financeiro somente no plano Exceção', () => {
    expect(planAllowsScreen(EXCEPTION_PLAN_CODE, 'screen:quotes')).toBe(false);
    expect(planAllowsScreen(EXCEPTION_PLAN_CODE, 'screen:finance')).toBe(false);
    expect(planAllowsScreen(EXCEPTION_PLAN_CODE, 'screen:service_orders')).toBe(true);
    expect(planAllowsScreen('start', 'screen:quotes')).toBe(true);
  });
});
