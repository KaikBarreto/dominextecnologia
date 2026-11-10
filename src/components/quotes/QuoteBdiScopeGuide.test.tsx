import { describe, expect, it } from 'vitest';

import { summarizeQuoteBdiScope } from './QuoteBdiScopeGuide';

describe('summarizeQuoteBdiScope', () => {
  const items = [
    { item_type: 'servico' as const, pricing_mode: 'cost_bdi' as const, quantity: 2, unit_total_cost: 100, unit_price: 150, unit_materials_cost: 20 },
    { item_type: 'material' as const, pricing_mode: 'registered' as const, quantity: 1, unit_total_cost: 40, unit_price: 70 },
    { item_type: 'material' as const, pricing_mode: 'manual' as const, quantity: 3, unit_total_cost: 10, unit_price: 25 },
  ];

  it('separa o que recebe BDI do que mantém preço cadastrado ou manual', () => {
    const result = summarizeQuoteBdiScope({
      items,
      useBdi: true,
      displacementMode: 'cost_bdi',
      displacementCost: 20,
      displacementPrice: 30,
    });

    expect(result.automatic).toMatchObject({ services: 1, materials: 0, displacement: true, cost: 220, customerPrice: 330 });
    expect(result.outside).toMatchObject({ registered: 1, manual: 1, displacement: false, cost: 70, customerPrice: 145 });
    expect(result.hasEmbeddedServiceMaterials).toBe(true);
  });

  it('trata todas as linhas como fora do automático quando o BDI está desligado', () => {
    const result = summarizeQuoteBdiScope({
      items,
      useBdi: false,
      displacementMode: 'cost_bdi',
      displacementCost: 20,
      displacementPrice: 30,
    });

    expect(result.automatic.cost).toBe(0);
    expect(result.outside).toMatchObject({ registered: 1, manual: 2, displacement: true, cost: 290, customerPrice: 475 });
  });
});
