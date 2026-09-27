import { describe, expect, it } from 'vitest';
import { buildDreCostCenterCategoryRows } from './dre-cost-center-categories';

const categories = [
  { id: 'fuel', name: 'Combustível', parent_id: null },
  { id: 'gas', name: 'Gasolina', parent_id: 'fuel' },
  { id: 'ethanol', name: 'Etanol', parent_id: 'fuel' },
  { id: 'service', name: 'Serviços', parent_id: null },
];

describe('buildDreCostCenterCategoryRows', () => {
  it('abre um centro em categoria e subcategoria sem perder lançamento direto no pai', () => {
    const rows = buildDreCostCenterCategoryRows([
      { transaction_type: 'saida', amount: 10, cost_center_id: 'cc-1', category: 'Combustível' },
      { transaction_type: 'saida', amount: 20.1, cost_center_id: 'cc-1', category: 'Gasolina' },
      { transaction_type: 'saida', amount: 5.2, cost_center_id: 'cc-1', category: 'Etanol' },
      { transaction_type: 'entrada', amount: 50, cost_center_id: 'cc-1', category: 'Serviços' },
      { transaction_type: 'saida', amount: 999, cost_center_id: 'cc-2', category: 'Gasolina' },
    ], categories, 'cc-1', 'Sem categoria');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: 'Combustível', expense: 35.3, result: -35.3 });
    expect(rows[0].own).toMatchObject({ expense: 10 });
    expect(rows[0].children.map((child) => [child.name, child.expense])).toEqual([
      ['Gasolina', 20.1],
      ['Etanol', 5.2],
    ]);
    expect(rows[1]).toMatchObject({ name: 'Serviços', revenue: 50, result: 50 });
  });

  it('mantém sem centro e sem categoria em baldes explícitos', () => {
    const rows = buildDreCostCenterCategoryRows([
      { transaction_type: 'saida', amount: '12.34', cost_center_id: null, category: null },
      { transaction_type: 'saida', amount: '1.11', cost_center_id: '', category: '' },
    ], categories, null, 'Sem categoria');

    expect(rows).toEqual([
      expect.objectContaining({ name: 'Sem categoria', expense: 13.45, result: -13.45 }),
    ]);
  });
});
