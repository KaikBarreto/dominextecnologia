import { describe, expect, it } from 'vitest';
import {
  classifyInventoryAbc,
  summarizeInventoryAbc,
  parseInventoryAbcReport,
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
  it('preserva devolução negativa no total e usa positivos para participação e resumo', () => {
    const rows = classifyInventoryAbc([
      row('Maior', { pdv_revenue: 100 }), row('Menor', { pdv_revenue: 25 }), row('Devolução', { pdv_revenue: -25 }),
    ], 'pdv');
    expect(rows.map(item => item.share)).toEqual([0.8, 0.2, 0]);
    expect(rows.map(item => item.abcClass)).toEqual(['A', 'B', 'C']);
    expect(rows.reduce((sum, item) => sum + item.metricValue, 0)).toBe(100);
    expect(rows.at(-1)?.cumulativeShare).toBe(1);
    expect(summarizeInventoryAbc(rows).map(item => item.share)).toEqual([0.8, 0.2, 0]);
    expect(summarizeInventoryAbc(rows).map(item => item.itemCount)).toEqual([1, 1, 1]);
  });
  it('aceita custo desconhecido explícito e rejeita dados inválidos antes do KPI', () => {
    expect(parseInventoryAbcReport([row('Sem custo', { pdv_cost: null, pdv_margin: null })])[0].pdv_margin).toBeNull();
    for (const invalid of [null, NaN, Infinity, '10', undefined]) {
      expect(() => parseInventoryAbcReport([row('Inválido', { pdv_revenue: invalid as number })])).toThrow('conferir os valores');
    }
    expect(() => parseInventoryAbcReport([row('duplicado', {}), row('duplicado', {})])).toThrow('conferir os valores');
    expect(() => parseInventoryAbcReport(null)).toThrow('conferir os valores');
  });
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
