import { describe, expect, it } from 'vitest';
import {
  isServiceMaterialCostOverride,
  materialBdiTotal,
  materialBdiUnitValue,
  sortServiceMaterials,
} from './serviceMaterialTable';

const rows = [
  { id: 'b', item_name: 'Tubo', quantity: 2, purchase_price: 20, subtotal: 40 },
  { id: 'a', item_name: 'Abraçadeira', quantity: 5, purchase_price: 3, subtotal: 15 },
];

describe('serviceMaterialTable', () => {
  it('ordena todas as métricas sem alterar a coleção original', () => {
    expect(sortServiceMaterials(rows, 'material', 'asc', 0.8).map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortServiceMaterials(rows, 'quantity', 'desc', 0.8).map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortServiceMaterials(rows, 'unit_cost', 'asc', 0.8).map((row) => row.id)).toEqual(['a', 'b']);
    expect(sortServiceMaterials(rows, 'subtotal', 'desc', 0.8).map((row) => row.id)).toEqual(['b', 'a']);
    expect(rows.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('aplica o fator BDI canônico na unidade e no total ponderado pela quantidade', () => {
    expect(materialBdiUnitValue(20, 0.8)).toBe(25);
    expect(materialBdiTotal(rows, 0.8)).toBeCloseTo(68.75);
  });

  it('marca override somente quando o custo salvo diverge da compra canônica', () => {
    expect(isServiceMaterialCostOverride(12.5, 10)).toBe(true);
    expect(isServiceMaterialCostOverride(10, 10)).toBe(false);
    expect(isServiceMaterialCostOverride(12.5, null)).toBe(false);
  });
});
