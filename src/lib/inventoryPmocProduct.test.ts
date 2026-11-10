import { describe, expect, it } from 'vitest';
import { validateInventoryPmocProduct } from './inventoryPmocProduct';

describe('validateInventoryPmocProduct', () => {
  it('ignora campos regulatorios quando o material nao e PMOC', () => {
    expect(validateInventoryPmocProduct({ isPmocProduct: false })).toBeNull();
  });

  it.each([
    [{ manufacturer: '', anvisaRegistration: 'ANVISA-1', expiresOn: '2027-01-01' }, 'manufacturer_required'],
    [{ manufacturer: 'Fabricante', anvisaRegistration: ' ', expiresOn: '2027-01-01' }, 'anvisa_required'],
    [{ manufacturer: 'Fabricante', anvisaRegistration: 'ANVISA-1', expiresOn: '' }, 'expiration_required'],
  ] as const)('exige os campos regulatorios obrigatorios', (fields, expected) => {
    expect(validateInventoryPmocProduct({ isPmocProduct: true, ...fields })).toBe(expected);
  });

  it('compara fabricacao e validade como dias civis inclusivos', () => {
    const base = {
      isPmocProduct: true,
      manufacturer: 'Fabricante',
      anvisaRegistration: 'ANVISA-1',
      expiresOn: '2027-01-01',
    };
    expect(validateInventoryPmocProduct({ ...base, manufacturedOn: '2027-01-01' })).toBeNull();
    expect(validateInventoryPmocProduct({ ...base, manufacturedOn: '2027-01-02' })).toBe('manufacture_after_expiration');
  });
});
