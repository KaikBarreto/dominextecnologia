import { describe, expect, it } from 'vitest';
import {
  classifyInventoryAbc,
  summarizeInventoryAbc,
  type InventoryAbcSourceRow,
} from '@/lib/inventory-abc';

const row = (name: string, values: Partial<InventoryAbcSourceRow>): InventoryAbcSourceRow => ({
  inventory_id: name,
  sku: name,
  material_name: name,
  unit: 'un',
  image_url: '',
  group_id: '',
  group_name: '',
  group_color: '',
  current_balance: 0,
  minimum_balance: 0,
  unit_cost: 0,
  sale_price: 0,
  stock_value: 0,
  usage_quantity: 0,
  usage_value: 0,
  pdv_quantity: 0,
  pdv_revenue: 0,
  pdv_cost: 0,
  pdv_margin: 0,
  ...values,
});

describe('Curva ABC de estoque', () => {
  it('classifica pelo valor da visão selecionada e preserva o maior item como A', () => {
    const rows = classifyInventoryAbc([
      row('Maior', { usage_value: 90 }),
      row('Médio', { usage_value: 7 }),
      row('Menor', { usage_value: 3 }),
    ], 'usage');

    expect(rows.map((item) => [item.material_name, item.abcClass])).toEqual([
      ['Maior', 'A'],
      ['Médio', 'B'],
      ['Menor', 'C'],
    ]);
    expect(rows[0].cumulativeShare).toBeCloseTo(0.9);
  });

  it('separa venda do PDV de capital imobilizado', () => {
    const source = [
      row('Vendedor', { pdv_revenue: 500, stock_value: 10 }),
      row('Imobilizado', { pdv_revenue: 5, stock_value: 900 }),
    ];

    expect(classifyInventoryAbc(source, 'pdv')[0].material_name).toBe('Vendedor');
    expect(classifyInventoryAbc(source, 'stock')[0].material_name).toBe('Imobilizado');
  });

  it('resume quantidade, valor e participação por classe', () => {
    const rows = classifyInventoryAbc([
      row('A', { stock_value: 80 }),
      row('B', { stock_value: 15 }),
      row('C', { stock_value: 5 }),
    ], 'stock');
    const summary = summarizeInventoryAbc(rows);

    expect(summary.map((item) => item.itemCount)).toEqual([1, 1, 1]);
    expect(summary.map((item) => item.share)).toEqual([0.8, 0.15, 0.05]);
  });
});
