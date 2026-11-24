export type SubscriptionPromotionScope = 'module' | 'extra_users';

export interface SubscriptionPromotionDraft {
  id?: string;
  scope_type: SubscriptionPromotionScope;
  module_code: string | null;
  quantity: number;
  standard_unit_price: number;
  promotional_unit_price: number;
  billing_cycles: number;
  consumed_cycles: number;
  reason: string;
}

export interface SubscriptionPromotionPayload {
  id?: string;
  scope_type: SubscriptionPromotionScope;
  module_code?: string;
  quantity: number;
  promotional_unit_price: number;
  billing_cycles: number;
  reason?: string;
}

export interface SubscriptionPromotionItem {
  key: string;
  label: string;
  description: string;
  scope_type: SubscriptionPromotionScope;
  module_code: string | null;
  quantity: number;
  standard_unit_price: number;
}

export function promotionItemKey(
  scopeType: SubscriptionPromotionScope,
  moduleCode?: string | null,
): string {
  return scopeType === 'module' ? `module:${moduleCode ?? ''}` : 'extra_users';
}

export function remainingPromotionCycles(promotion: SubscriptionPromotionDraft): number {
  return Math.max(0, Math.floor(promotion.billing_cycles) - Math.floor(promotion.consumed_cycles));
}

export function calculatePromotionalMonthlyValue(
  normalMonthlyValue: number,
  promotions: SubscriptionPromotionDraft[],
): number {
  const discount = promotions.reduce((total, promotion) => {
    if (remainingPromotionCycles(promotion) <= 0) return total;
    const quantity = Math.max(1, Math.floor(promotion.quantity));
    const normal = Math.max(0, Number(promotion.standard_unit_price) || 0);
    const promotional = Math.min(normal, Math.max(0, Number(promotion.promotional_unit_price) || 0));
    return total + ((normal - promotional) * quantity);
  }, 0);

  return Math.max(0, Math.round((Math.max(0, normalMonthlyValue) - discount) * 100) / 100);
}

export function toPromotionPayload(
  promotions: SubscriptionPromotionDraft[],
): SubscriptionPromotionPayload[] {
  return promotions.map((promotion) => ({
    ...(promotion.id ? { id: promotion.id } : {}),
    scope_type: promotion.scope_type,
    ...(promotion.module_code ? { module_code: promotion.module_code } : {}),
    quantity: Math.max(1, Math.floor(promotion.quantity)),
    promotional_unit_price: Math.max(0, Number(promotion.promotional_unit_price) || 0),
    billing_cycles: Math.max(1, Math.floor(promotion.billing_cycles)),
    ...(promotion.reason.trim() ? { reason: promotion.reason.trim() } : {}),
  }));
}

export function isPromotionDraftValid(promotion: SubscriptionPromotionDraft): boolean {
  const standard = Number(promotion.standard_unit_price);
  const promotional = Number(promotion.promotional_unit_price);
  return Number.isFinite(standard)
    && standard >= 0
    && Number.isFinite(promotional)
    && promotional >= 0
    && promotional <= standard
    && Number.isInteger(promotion.billing_cycles)
    && promotion.billing_cycles > 0
    && promotion.billing_cycles <= 60
    && Number.isInteger(promotion.quantity)
    && promotion.quantity > 0;
}

export function extraUsersPromotionItem(
  quantity: number,
  standardUnitPrice: number,
): SubscriptionPromotionItem {
  return {
    key: promotionItemKey('extra_users'),
    label: `${quantity} ${quantity === 1 ? 'usuário adicional' : 'usuários adicionais'}`,
    description: 'O limite ampliado fica disponível imediatamente.',
    scope_type: 'extra_users',
    module_code: null,
    quantity,
    standard_unit_price: standardUnitPrice,
  };
}

export function modulePromotionItem(
  moduleCode: string,
  label: string,
  standardUnitPrice: number,
): SubscriptionPromotionItem {
  return {
    key: promotionItemKey('module', moduleCode),
    label,
    description: 'O módulo fica disponível imediatamente para a empresa.',
    scope_type: 'module',
    module_code: moduleCode,
    quantity: 1,
    standard_unit_price: standardUnitPrice,
  };
}
