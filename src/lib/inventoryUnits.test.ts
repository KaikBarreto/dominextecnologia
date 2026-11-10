import { describe, expect, it } from 'vitest';
import { inventoryQuantityStep } from '@/lib/inventoryUnits';

describe('inventoryQuantityStep', () => {
  it.each(['kg', 'l', 'm'])('usa passo fracionado para %s', (unit) => {
    expect(inventoryQuantityStep(unit)).toBe(0.1);
  });

  it.each(['un', 'pc', 'cx', null, undefined])('mantém passo inteiro para %s', (unit) => {
    expect(inventoryQuantityStep(unit)).toBe(1);
  });
});
