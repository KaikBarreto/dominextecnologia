export interface ServiceExtraCostLine {
  amount?: number | null;
}

export interface ServiceMaterialCostLine {
  subtotal?: number | null;
}

export interface ServiceResourceLinkCostLine {
  resource_id: string;
  override_value?: number | null;
}

export interface ServiceResourceRateLine {
  id: string;
  hourly_rate?: number | null;
  category?: string | null;
}

export interface ServiceGiftCostLine {
  subtotal?: number | null;
}

export interface ServiceCostBreakdownInput {
  hourlyRate?: number | null;
  hours?: number | null;
  extraCosts?: ServiceExtraCostLine[] | null;
  materials?: ServiceMaterialCostLine[] | null;
  resourceLinks?: ServiceResourceLinkCostLine[] | null;
  resources?: ServiceResourceRateLine[] | null;
  gifts?: ServiceGiftCostLine[] | null;
}

export interface ServiceCostBreakdown {
  hourlyRate: number;
  hours: number;
  laborCost: number;
  materialsCost: number;
  extrasCost: number;
  resourcesCost: number;
  giftsCost: number;
  /** Recursos vinculados e brindes, como exibido na aba Recursos. */
  linkedResourcesCost: number;
  /** Campo persistido pelo orçamento: extras manuais + recursos + brindes. */
  quoteExtrasCost: number;
  totalCost: number;
}

const nonNegative = (value: number | null | undefined): number =>
  Math.max(0, Number(value ?? 0) || 0);

/**
 * Fonte canônica da composição do custo de um tipo de serviço.
 *
 * A tela de custos e o orçamento devem usar esta mesma decomposição para que
 * materiais, recursos, extras e total nunca dependam da ordem de navegação ou
 * de implementações paralelas.
 */
export function computeServiceCostBreakdown(input: ServiceCostBreakdownInput): ServiceCostBreakdown {
  const hourlyRate = nonNegative(input.hourlyRate);
  const hours = nonNegative(input.hours);
  const laborCost = hourlyRate * hours;
  const materialsCost = (input.materials ?? []).reduce(
    (sum, material) => sum + nonNegative(material.subtotal),
    0,
  );
  const extrasCost = (input.extraCosts ?? []).reduce(
    (sum, extra) => sum + nonNegative(extra.amount),
    0,
  );

  const ratesById = new Map((input.resources ?? []).map((resource) => [resource.id, resource]));
  const resourcesCost = (input.resourceLinks ?? []).reduce((sum, link) => {
    const resource = ratesById.get(link.resource_id);
    if (!resource || resource.category === 'gift') return sum;
    const cost = link.override_value != null
      ? nonNegative(link.override_value)
      : nonNegative(resource.hourly_rate) * hours;
    return sum + cost;
  }, 0);
  const giftsCost = (input.gifts ?? []).reduce(
    (sum, gift) => sum + nonNegative(gift.subtotal),
    0,
  );
  const linkedResourcesCost = resourcesCost + giftsCost;
  const quoteExtrasCost = extrasCost + linkedResourcesCost;

  return {
    hourlyRate,
    hours,
    laborCost,
    materialsCost,
    extrasCost,
    resourcesCost,
    giftsCost,
    linkedResourcesCost,
    quoteExtrasCost,
    totalCost: laborCost + materialsCost + quoteExtrasCost,
  };
}
