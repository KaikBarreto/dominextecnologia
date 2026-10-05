export const BASE_SUBSCRIPTION_MODULE_CODE = 'basic';
export const CUSTOMER_PORTAL_MODULE_CODE = 'customer_portal';
export const EXTRA_USER_MODULE_CODE = 'extra_user';
export const CUSTOM_PLAN_INCLUDED_USERS = 2;

export const REQUIRED_CUSTOM_MODULE_CODES = [
  BASE_SUBSCRIPTION_MODULE_CODE,
  CUSTOMER_PORTAL_MODULE_CODE,
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
