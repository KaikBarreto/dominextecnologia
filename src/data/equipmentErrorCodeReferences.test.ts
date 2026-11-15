import { describe, expect, it } from 'vitest';
import { getEquipmentCodeReference, getReferenceErrorCodes, mergeEquipmentErrorCodeReferences } from './equipmentErrorCodeReferences';

const daikin = { id: 'model-daikin', code: 'FTKP09S5VL', domain: 'ar_condicionado', brand: { name: 'Daikin' } };
describe('referências de códigos restritas aos modelos documentados', () => {
  it('cobre exatamente FTKP/FTHP Q e S e mantém a fonte de cada manual', () => {
    expect(getReferenceErrorCodes(daikin)).toHaveLength(28);
    expect(getEquipmentCodeReference(daikin)?.document).toBe('Daikin 3P611135-1G');
    expect(getEquipmentCodeReference({ ...daikin, code: 'FTHP24Q5VL' })?.document).toBe('Daikin 3P611135-2F');
    expect(getEquipmentCodeReference({ ...daikin, code: 'FTKC09T5VL' })).toBeNull();
    expect(getEquipmentCodeReference({ ...daikin, code: 'FTKP50XV16VKA' })).toBeNull();
  });
  it('não generaliza por marca, nome, domínio ou código parcialmente semelhante', () => {
    expect(getEquipmentCodeReference({ ...daikin, code: null })).toBeNull();
    expect(getEquipmentCodeReference({ ...daikin, domain: 'compressor' })).toBeNull();
    expect(getEquipmentCodeReference({ ...daikin, brand: { name: 'Outra' } })).toBeNull();
    expect(getEquipmentCodeReference({ ...daikin, code: 'XFTKP09S5VL' })).toBeNull();
  });
  it('cobre Samsung DYFA comprovado, sem atribuir a tabela a outro WindFree', () => {
    const samsung = { ...daikin, brand: { name: 'Samsung' }, code: 'AR09DYFAAWKNAZ' };
    expect(getReferenceErrorCodes(samsung)).toHaveLength(10);
    expect(getReferenceErrorCodes(samsung).find((entry) => entry.code === 'C101')?.title).toContain('comunicação');
    expect(getEquipmentCodeReference(samsung)?.distributorCopy).toBe(true);
    expect(getEquipmentCodeReference({ ...samsung, code: 'AR09BVFAAWKNAZ' })).toBeNull();
    expect(getEquipmentCodeReference({ ...samsung, code: 'AR24DYFAAWKNAZ' })).toBeNull();
  });
  it('preserva conteúdo cadastrado e só complementa códigos faltantes sem duplicação', () => {
    const custom = { code: 'u 4', title: 'Diagnóstico revisado do catálogo', extra: true };
    const result = mergeEquipmentErrorCodeReferences([custom], daikin);
    expect(result).toHaveLength(28);
    expect(result.find((entry) => entry.code === 'u 4')).toBe(custom);
    expect(result.filter((entry) => entry.code.replace(/\s/g, '').toUpperCase() === 'U4')).toHaveLength(1);
    expect(result.find((entry) => entry.code === 'C4')).toMatchObject({ reference_id: 'daikin-ftkp-qs', model_id: 'model-daikin', diagnosis: null, solution: null });
  });
});
