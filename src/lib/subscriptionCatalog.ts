export const BASE_SUBSCRIPTION_MODULE_CODE = 'basic';
export const CUSTOMER_PORTAL_MODULE_CODE = 'customer_portal';
export const EXTRA_USER_MODULE_CODE = 'extra_user';
export const WHATSAPP_MODULE_CODE = 'whatsapp';
export const CUSTOM_PLAN_INCLUDED_USERS = 5;
export const EXCEPTION_PLAN_CODE = 'excecao';
// Código preservado no banco para gates e snapshots antigos, mas nunca
// vendido separadamente: o Financeiro Avançado agora pertence à base.
export const RETIRED_PROPOSAL_MODULE_CODES = ['finance_advanced'] as const;

const EXCEPTION_RESTRICTED_SCREENS = new Set([
  'screen:quotes',
  'screen:finance',
]);

/**
 * O plano Exceção reaproveita a base operacional, mas não contrata Orçamentos
 * nem Financeiro. Esta regra complementa o gate por módulo porque, nos demais
 * planos, essas duas telas ainda fazem parte do módulo `basic`.
 */
export function planAllowsScreen(planCode: string | null | undefined, screenId: string): boolean {
  return planCode !== EXCEPTION_PLAN_CODE || !EXCEPTION_RESTRICTED_SCREENS.has(screenId);
}

export const FREE_BASE_MODULE_CODES = [
  CUSTOMER_PORTAL_MODULE_CODE,
  'finance_advanced',
  'pricing_advanced',
  'video_questions',
] as const;

export const REQUIRED_CUSTOM_MODULE_CODES = [
  BASE_SUBSCRIPTION_MODULE_CODE,
  ...FREE_BASE_MODULE_CODES,
] as const;

export function isRequiredCustomModule(code: string): boolean {
  return REQUIRED_CUSTOM_MODULE_CODES.some((requiredCode) => requiredCode === code);
}

export function isRetiredProposalModule(code: string): boolean {
  return RETIRED_PROPOSAL_MODULE_CODES.some((retiredCode) => retiredCode === code);
}

export function withRequiredCustomModules(codes: string[]): string[] {
  return Array.from(new Set([...REQUIRED_CUSTOM_MODULE_CODES, ...codes]));
}

export function resolveExtraUserPrice(
  modules: Array<{ code: string; price: number | null | undefined }>,
): number | null {
  const price = Number(modules.find((module) => module.code === EXTRA_USER_MODULE_CODE)?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export interface WhatsappTierPrice {
  tier: number;
  price: number;
}

/**
 * A proposta comercial vende o primeiro nível pago de WhatsApp. O nível grátis
 * continua disponível no produto, mas não representa o add-on contratado na
 * proposta. O valor permanece vindo de `whatsapp_tiers`, sem preço duplicado no
 * frontend ou em `subscription_modules`.
 */
export function resolveProposalWhatsappPrice(
  tiers: Array<{ tier: number | null | undefined; price: number | null | undefined }>,
): WhatsappTierPrice | null {
  const paidTiers = tiers
    .map((tier) => ({ tier: Number(tier.tier), price: Number(tier.price) }))
    .filter((tier) => Number.isInteger(tier.tier) && tier.tier > 0 && Number.isFinite(tier.price) && tier.price > 0)
    .sort((a, b) => a.tier - b.tier);

  return paidTiers[0] ?? null;
}
