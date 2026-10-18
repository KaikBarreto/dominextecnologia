import type { QuoteItem } from '@/hooks/useQuotes';

export interface ServiceOrderBudgetItem extends QuoteItem {
  source_quote_item_id?: string | null;
}

export interface ServiceOrderBudgetTotals {
  services: number;
  materials: number;
  total: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;
// Calcula em centavos para espelhar NUMERIC do Postgres e evitar que
// 2.5 × 19.99 (49.974999...) arredonde um centavo abaixo.
const lineTotal = (quantity: number, unitPrice: number) =>
  Math.round(quantity * Math.round(unitPrice * 100)) / 100;

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
  }));
}

/** Detecta alteração real sem depender dos IDs/timestamps gerados no banco. */
export function serviceOrderBudgetSignature(items: ServiceOrderBudgetItem[]): string {
  return JSON.stringify(toServiceOrderBudgetPayload(items));
}
