import { describe, expect, it } from 'vitest';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';
import {
  buildFinancialCategoryLookup,
  financialCategoryColorToRgb,
  resolveFinancialCategoryDisplay,
} from './financial-category-display';

function category(overrides: Partial<FinancialCategory> = {}): FinancialCategory {
  return {
    id: 'ac105377-6df7-46db-a9e3-46ec14b8f7b4',
    name: 'Vendas',
    type: 'entrada',
    color: '#16A34A',
    icon: 'ShoppingCart',
    is_active: true,
    dre_group: 'receita',
    dre_group_id: null,
    dfc_group: 'operacional',
    is_system: false,
    company_id: 'company-1',
    parent_id: null,
    created_at: '2026-11-13T00:00:00Z',
    updated_at: '2026-11-13T00:00:00Z',
    ...overrides,
  };
}

describe('financial category display', () => {
  const sales = category();
  const lookup = buildFinancialCategoryLookup([sales]);

  it('resolve o UUID legado para nome e cor cadastrados', () => {
    expect(resolveFinancialCategoryDisplay(sales.id, lookup)).toMatchObject({
      name: 'Vendas',
      color: '#16a34a',
      category: sales,
    });
  });

  it('preserva nomes históricos e usa cor segura quando a categoria não existe mais', () => {
    expect(resolveFinancialCategoryDisplay('Categoria antiga', lookup)).toMatchObject({
      name: 'Categoria antiga',
      color: '#64748b',
      category: null,
    });
  });

  it('normaliza a cor curta para o RGB usado pelo PDF', () => {
    expect(financialCategoryColorToRgb('#0a5')).toEqual([0, 170, 85]);
  });
});
