import type { QuoteItem } from '@/hooks/useQuotes';

export type ServiceOrderBudgetPricingMode = 'registered' | 'cost_bdi' | 'manual';

export interface ServiceOrderBudgetPricing {
  use_bdi: boolean;
  tax_rate: number;
  admin_indirect_rate: number;
  profit_rate: number;
  bdi: number;
  total_cost: number;
  km_cost: number;
  distance_km: number;
  displacement_cost: number;
  /** Deslocamento, desconto ou ajuste líquido herdado do orçamento de origem. */
  commercial_adjustment: number;
}

export const DEFAULT_SERVICE_ORDER_BUDGET_PRICING: ServiceOrderBudgetPricing = {
  use_bdi: false,
  tax_rate: 10,
  admin_indirect_rate: 12,
  profit_rate: 10,
  bdi: 0.68,
  total_cost: 0,
  km_cost: 0,
  distance_km: 0,
  displacement_cost: 0,
  commercial_adjustment: 0,
};

export interface ServiceOrderBudgetItem extends QuoteItem {
  source_quote_item_id?: string | null;
  pricing_mode?: ServiceOrderBudgetPricingMode;
}

export interface ServiceOrderBudgetTotals {
  services: number;
  materials: number;
  total: number;
}

export interface ServiceOrderBudgetCatalogService {
  id: string;
  name: string;
  default_price: number | null;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;
// Calcula em centavos para espelhar NUMERIC do Postgres e evitar que
// 2.5 × 19.99 (49.974999...) arredonde um centavo abaixo.
const lineTotal = (quantity: number, unitPrice: number) =>
  Math.round(quantity * Math.round(unitPrice * 100)) / 100;

export function calculateServiceOrderBdiFactor(
  taxRate: number,
  adminRate: number,
  profitRate: number,
) {
  const raw = (100 - (Number(taxRate || 0) + Number(adminRate || 0) + Number(profitRate || 0))) / 100;
  return Number.isFinite(raw) ? Math.max(0.01, raw) : 0.01;
}

export function calculateServiceOrderBudgetCost(items: ServiceOrderBudgetItem[]) {
  return roundMoney(items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_total_cost || 0),
    0,
  ));
}

export function applyBdiToServiceOrderBudgetItems(
  items: ServiceOrderBudgetItem[],
  bdiFactor: number,
): ServiceOrderBudgetItem[] {
  const factor = Math.max(0.01, Number(bdiFactor || 0));
  return items.map(item => {
    const cost = Number(item.unit_total_cost || 0);
    if (cost <= 0) return item;
    const unitPrice = roundMoney(cost / factor);
    return {
      ...item,
      pricing_mode: 'cost_bdi',
      bdi: factor,
      price_override: null,
      unit_price: unitPrice,
      total_price: lineTotal(Number(item.quantity || 0), unitPrice),
    };
  });
}

export function recalculateAutomaticServiceOrderBudgetItems(
  items: ServiceOrderBudgetItem[],
  bdiFactor: number,
): ServiceOrderBudgetItem[] {
  const factor = Math.max(0.01, Number(bdiFactor || 0));
  return items.map(item => {
    const cost = Number(item.unit_total_cost || 0);
    if (item.pricing_mode !== 'cost_bdi' || cost <= 0) return item;
    const unitPrice = roundMoney(cost / factor);
    return {
      ...item,
      bdi: factor,
      price_override: null,
      unit_price: unitPrice,
      total_price: lineTotal(Number(item.quantity || 0), unitPrice),
    };
  });
}

export function preserveServiceOrderBudgetPricesAsManual(
  items: ServiceOrderBudgetItem[],
): ServiceOrderBudgetItem[] {
  return items.map(item => item.pricing_mode === 'cost_bdi'
    ? { ...item, pricing_mode: 'manual', price_override: Number(item.unit_price || 0) }
    : item);
}

/**
 * Recalcula os totais sempre a partir de quantidade × valor unitário. O campo
 * `total_price` vindo da tela é apenas uma prévia e nunca é a fonte da verdade.
 */
export function calculateServiceOrderBudgetTotals(
  items: ServiceOrderBudgetItem[],
): ServiceOrderBudgetTotals {
  let services = 0;
  let materials = 0;

  for (const item of items) {
    const total = lineTotal(Number(item.quantity || 0), Number(item.unit_price || 0));
    if (item.item_type === 'material') materials += total;
    else services += total;
  }

  services = roundMoney(services);
  materials = roundMoney(materials);
  return { services, materials, total: roundMoney(services + materials) };
}

/**
 * Inclui no orçamento os serviços recém-selecionados na OS. Assim o seletor
 * operacional e a quantidade comercial não viram dois fluxos desconectados.
 * Linhas já existentes são preservadas, inclusive preço negociado e quantidade.
 */
export function appendMissingServiceOrderBudgetItems(
  items: ServiceOrderBudgetItem[],
  services: ServiceOrderBudgetCatalogService[],
): ServiceOrderBudgetItem[] {
  const existingServiceIds = new Set(
    items
      .filter(item => item.item_type !== 'material')
      .map(item => item.service_type_id)
      .filter((id): id is string => !!id),
  );
  const additions = services
    .filter(service => !existingServiceIds.has(service.id))
    .map((service, index): ServiceOrderBudgetItem => {
      const unitPrice = roundMoney(Number(service.default_price ?? 0));
      return {
        position: items.length + index,
        item_type: 'servico',
        description: service.name,
        quantity: 1,
        unit_price: unitPrice,
        total_price: unitPrice,
        inventory_id: null,
        service_type_id: service.id,
        pricing_mode: 'registered',
        price_override: unitPrice,
      };
    });

  return additions.length > 0 ? [...items, ...additions] : items;
}

/** Payload mínimo e estável aceito pela RPC sync_service_order_budget. */
export function toServiceOrderBudgetPayload(items: ServiceOrderBudgetItem[]) {
  return items.map((item, position) => ({
    position,
    item_type: item.item_type === 'material'
      ? 'material'
      : item.item_type === 'mao_de_obra'
        ? 'mao_de_obra'
        : 'servico',
    description: item.description.trim(),
    details: item.details?.trim() || null,
    quantity: Number(item.quantity),
    unit_price: roundMoney(Number(item.unit_price)),
    inventory_id: item.inventory_id || null,
    service_type_id: item.service_type_id || null,
    source_quote_item_id: item.source_quote_item_id || null,
    pricing_mode: item.pricing_mode ?? 'manual',
    unit_hourly_rate: Math.max(0, Number(item.unit_hourly_rate || 0)),
    unit_hours: Math.max(0, Number(item.unit_hours || 0)),
    unit_labor_cost: Math.max(0, Number(item.unit_labor_cost || 0)),
    unit_materials_cost: Math.max(0, Number(item.unit_materials_cost || 0)),
    unit_extras_cost: Math.max(0, Number(item.unit_extras_cost || 0)),
    unit_total_cost: Math.max(0, Number(item.unit_total_cost || 0)),
    profit_rate: Math.max(0, Number(item.profit_rate || 0)),
    bdi: Math.max(0.01, Number(item.bdi || 0.01)),
    price_override: item.pricing_mode === 'cost_bdi'
      ? null
      : roundMoney(Number(item.price_override ?? item.unit_price ?? 0)),
  }));
}

export function toServiceOrderBudgetPricingPayload(
  pricing: ServiceOrderBudgetPricing,
  items: ServiceOrderBudgetItem[],
) {
  const bdi = calculateServiceOrderBdiFactor(
    pricing.tax_rate,
    pricing.admin_indirect_rate,
    pricing.profit_rate,
  );
  return {
    use_bdi: Boolean(pricing.use_bdi),
    tax_rate: Number(pricing.tax_rate || 0),
    admin_indirect_rate: Number(pricing.admin_indirect_rate || 0),
    profit_rate: Number(pricing.profit_rate || 0),
    bdi,
    total_cost: calculateServiceOrderBudgetCost(items),
    km_cost: Math.max(0, Number(pricing.km_cost || 0)),
    distance_km: Math.max(0, Number(pricing.distance_km || 0)),
    displacement_cost: Math.max(0, Number(pricing.displacement_cost || 0)),
    commercial_adjustment: roundMoney(Number(pricing.commercial_adjustment || 0)),
  };
}

/** Detecta alteração real sem depender dos IDs/timestamps gerados no banco. */
export function serviceOrderBudgetSignature(items: ServiceOrderBudgetItem[]): string {
  return JSON.stringify(toServiceOrderBudgetPayload(items));
}

export function serviceOrderBudgetPricingSignature(
  pricing: ServiceOrderBudgetPricing,
  items: ServiceOrderBudgetItem[],
): string {
  return JSON.stringify(toServiceOrderBudgetPricingPayload(pricing, items));
}
