export const BASE_SUBSCRIPTION_MODULE_CODE = 'basic';
export const CUSTOMER_PORTAL_MODULE_CODE = 'customer_portal';
export const EXTRA_USER_MODULE_CODE = 'extra_user';
export const CUSTOM_PLAN_INCLUDED_USERS = 5;
export const EXCEPTION_PLAN_CODE = 'excecao';

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

export function withRequiredCustomModules(codes: string[]): string[] {
  return Array.from(new Set([...REQUIRED_CUSTOM_MODULE_CODES, ...codes]));
}

export function resolveExtraUserPrice(
  modules: Array<{ code: string; price: number | null | undefined }>,
): number | null {
  const price = Number(modules.find((module) => module.code === EXTRA_USER_MODULE_CODE)?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}
