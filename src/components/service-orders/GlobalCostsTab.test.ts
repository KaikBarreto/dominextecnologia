import { describe, expect, it } from 'vitest';
import { filterGlobalCostResources } from './globalCostResourceFilters';
import type { CostResource } from '@/hooks/useCostResources';

const resource = (
  id: string,
  category: CostResource['category'],
  isActive: boolean,
): CostResource => ({
  id,
  company_id: 'company-1',
  category,
  name: id,
  is_active: isActive,
  monthly_hours: 176,
  notes: null,
  photo_url: null,
  created_at: '2026-10-29T00:00:00.000Z',
  updated_at: '2026-10-29T00:00:00.000Z',
});

const resources = [
  resource('veiculo-ativo', 'vehicle', true),
  resource('veiculo-inativo', 'vehicle', false),
  resource('ferramenta-ativa', 'tool', true),
];

describe('filterGlobalCostResources', () => {
  it('mantém todas as categorias e status quando nenhum filtro está ativo', () => {
    expect(filterGlobalCostResources(resources, [], [])).toEqual(resources);
  });

  it('combina filtros de categoria e status', () => {
    expect(filterGlobalCostResources(resources, ['vehicle'], ['active']).map((item) => item.id))
      .toEqual(['veiculo-ativo']);
  });

  it('aceita múltiplas categorias e o status inativo', () => {
    expect(filterGlobalCostResources(resources, ['vehicle', 'tool'], ['inactive']).map((item) => item.id))
      .toEqual(['veiculo-inativo']);
  });
});
