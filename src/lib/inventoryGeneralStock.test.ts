import { describe, expect, it } from 'vitest';
import {
  getGeneralLowStockLevelCount,
  getGeneralStockQuantity,
  type GeneralStockLevel,
} from './inventoryGeneralStock';

const level = (overrides: Partial<GeneralStockLevel> = {}): GeneralStockLevel => ({
  inventory_id: 'material-1',
  quantity: 0,
  min_quantity: null,
  is_present: true,
  ...overrides,
});

describe('projeções do estoque geral', () => {
  it('soma somente os níveis recebidos e presentes', () => {
    const visible = [
      level({ quantity: 2.5 }),
      level({ quantity: 3 }),
      level({ quantity: 99, is_present: false }),
      level({ inventory_id: 'outro-material', quantity: 50 }),
    ];

    expect(getGeneralStockQuantity(visible, 'material-1')).toBe(5.5);
  });

  it('conta mínimos por local sem comparar unidades ou somar mínimos', () => {
    const visible = [
      level({ quantity: 2, min_quantity: 3 }),
      level({ quantity: 5, min_quantity: 3 }),
      level({ quantity: 0, min_quantity: 1, is_present: false }),
      level({ quantity: 0, min_quantity: null }),
    ];

    expect(getGeneralLowStockLevelCount(visible, 'material-1')).toBe(1);
  });
});
