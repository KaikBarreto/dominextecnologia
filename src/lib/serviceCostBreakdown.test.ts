import { describe, expect, it } from 'vitest';
import { computeServiceCostBreakdown } from './serviceCostBreakdown';

describe('computeServiceCostBreakdown', () => {
  it('mantém no orçamento a mesma soma de materiais e recursos do Resumo', () => {
    const result = computeServiceCostBreakdown({
      hourlyRate: 0,
      hours: 2,
      materials: [{ subtotal: 25.6 }],
      resourceLinks: [
        { resource_id: 'vehicle', override_value: 67.99 },
        { resource_id: 'tool', override_value: null },
      ],
      resources: [
        { id: 'vehicle', hourly_rate: 0, category: 'vehicle' },
        { id: 'tool', hourly_rate: 8.43, category: 'tool' },
      ],
      gifts: [],
      extraCosts: [],
    });

    expect(result.materialsCost).toBeCloseTo(25.6);
    expect(result.linkedResourcesCost).toBeCloseTo(84.85);
    expect(result.quoteExtrasCost).toBeCloseTo(84.85);
    expect(result.totalCost).toBeCloseTo(110.45);
  });

  it('separa extras manuais, recursos e brindes sem perder o total agregado do orçamento', () => {
    const result = computeServiceCostBreakdown({
      hourlyRate: 40,
      hours: 1.5,
      extraCosts: [{ amount: 10 }],
      materials: [{ subtotal: 20 }],
      resourceLinks: [{ resource_id: 'vehicle', override_value: null }],
      resources: [{ id: 'vehicle', hourly_rate: 30, category: 'vehicle' }],
      gifts: [{ subtotal: 5 }],
    });

    expect(result.laborCost).toBe(60);
    expect(result.resourcesCost).toBe(45);
    expect(result.giftsCost).toBe(5);
    expect(result.quoteExtrasCost).toBe(60);
    expect(result.totalCost).toBe(140);
  });
});
