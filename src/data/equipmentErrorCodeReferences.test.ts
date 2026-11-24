import { describe, expect, it } from 'vitest';
import { getEquipmentCodeReference, getReferenceErrorCodes, mergeEquipmentErrorCodeReferences } from './equipmentErrorCodeReferences';

const daikin = { id: 'model-daikin', code: 'FTKP09S5VL', domain: 'ar_condicionado', brand: { name: 'Daikin' } };
describe('referências de códigos restritas aos modelos documentados', () => {
  it('mantém pares explícitos de marca e modelo nas novas referências', () => {
    const model = { ...daikin, brand: { name: 'Springer' }, code: '42AFVCH09S5' };
    expect(getEquipmentCodeReference(model)?.id).toBe('springer-midea-airvolution-inverter');
    expect(getEquipmentCodeReference({ ...model, brand: { name: 'Midea' } })).toBeNull();
    expect(getEquipmentCodeReference({ ...model, code: '42AFVCH09S5X' })).toBeNull();
    const midea = { ...model, brand: { name: 'Midea' }, code: '42AGVCI09M5' };
    expect(getEquipmentCodeReference(midea)?.id).toBe('midea-xtreme-save-r32');
    expect(getEquipmentCodeReference({ ...midea, brand: { name: 'Springer' } })).toBeNull();
  });
  it('não atribui proteção de aquecimento ao Springer Duo apenas frio', () => {
    const model = { ...daikin, brand: { name: 'Springer' }, code: 'QCA 075 RBB' };
    expect(getReferenceErrorCodes(model).some(entry => entry.code === 'A1')).toBe(false);
    expect(getReferenceErrorCodes({ ...model, code: 'QQA 075 RBB' }).some(entry => entry.code === 'A1')).toBe(true);
  });
  it('limita sensores LG e comissionamento Samsung aos modelos conferidos', () => {
    const lg = { ...daikin, brand: { name: 'LG' }, code: 'ARUN100LTE5' };
    expect(getReferenceErrorCodes(lg).map(entry => entry.code)).toEqual(['CH01', 'CH02', 'CH06']);
    expect(getEquipmentCodeReference({ ...lg, code: 'ARUN100LTE4' })).toBeNull();
    const samsung = { ...lg, brand: { name: 'Samsung' }, code: 'AM080AXVANH/EA' };
    expect(getEquipmentCodeReference(samsung)?.context).toBe('commissioning');
    expect(getReferenceErrorCodes(samsung).map(entry => entry.code)).toEqual(['E503', 'E505', 'E506']);
    expect(getEquipmentCodeReference({ ...samsung, brand: { name: 'Gree' } })).toBeNull();
  });
  it('cobre exatamente FTKP/FTHP Q e S e mantém a fonte de cada manual', () => {
    expect(getReferenceErrorCodes(daikin)).toHaveLength(28);
    expect(getEquipmentCodeReference(daikin)?.document).toBe('Daikin 3P611135-1G');
    expect(getEquipmentCodeReference({ ...daikin, code: 'FTHP24Q5VL' })?.document).toBe('Daikin 3P611135-2F');
    expect(getEquipmentCodeReference({ ...daikin, code: 'FTKC09T5VL' })?.document).toBe('Daikin 3P775937-1B');
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
    expect(getEquipmentCodeReference({ ...samsung, code: 'AR24DYFAAWKNAZ' })?.id).toBe('samsung-dyfa');
  });

  it('distingue as tabelas do Advance frio, quente/frio e Exclusive', () => {
    const codes = (code: string) => getReferenceErrorCodes({ ...daikin, code });
    expect(codes('FTK09P5VL')).toHaveLength(27);
    expect(codes('FTK09P5VL').some((entry) => entry.code === 'EA')).toBe(false);
    expect(codes('FTH09P5VL')).toHaveLength(28);
    expect(codes('FTH09P5VL').find((entry) => entry.code === 'A5')?.title).toContain('alta pressão');
    expect(codes('FTHS09T5VL')).toHaveLength(29);
    expect(codes('FTHS09T5VL').find((entry) => entry.code === 'F8')?.title).toContain('compressor');
    expect(codes('FTXM32TVL')).toHaveLength(28);
    expect(getEquipmentCodeReference({ ...daikin, code: 'FTXM32TVL' })).toMatchObject({ page: 36, pdfPage: 37 });
  });
  it('mantém o significado específico SkyAir, sem herdar E5 do hi-wall', () => {
    const skyair = { ...daikin, code: 'FCQ36AVL' };
    expect(getReferenceErrorCodes(skyair)).toHaveLength(44);
    expect(getReferenceErrorCodes(skyair).find((entry) => entry.code === 'E5')?.title).toBe('Motor do compressor travado');
    expect(getReferenceErrorCodes(skyair).find((entry) => entry.code === 'A3')?.title).toContain('drenagem');
    expect(getEquipmentCodeReference(skyair)).toMatchObject({ document: 'Daikin SiBR281412B · diagnóstico de serviço', page: 84, pdfPage: 20 });
    expect(getEquipmentCodeReference({ ...daikin, code: 'FBQ48AVL' })?.id).toBe('daikin-skyair-avl');
    expect(getEquipmentCodeReference({ ...daikin, code: 'FCQ36KVL' })).toBeNull();
    expect(getEquipmentCodeReference({ ...daikin, code: 'RXYQ12TYDN' })).toBeNull();
  });
  it('respeita classes e famílias dos manuais Samsung, inclusive 24 mil', () => {
    for (const family of ['DXEA', 'DXFA', 'DYFA', 'DYFZ']) {
      for (const size of ['09', '12', '18', '24']) {
        const model = { ...daikin, brand: { name: 'Samsung' }, code: `AR${size}${family}AWKNAZ` };
        expect(getReferenceErrorCodes(model)).toHaveLength(10);
        expect(getEquipmentCodeReference(model)?.id).toBe('samsung-dyfa');
      }
    }
    const samsung = { ...daikin, brand: { name: 'Samsung' } };
    expect(getEquipmentCodeReference({ ...samsung, code: 'AR24CVFAAWKNAZ' })?.document).toBe('Samsung DB68-12233A-00');
    expect(getEquipmentCodeReference({ ...samsung, code: 'AR30DYFAAWKNAZ' })).toBeNull();
    expect(getEquipmentCodeReference({ ...samsung, code: 'AR24DYFBAWKNAZ' })).toBeNull();
    expect(getEquipmentCodeReference({ ...samsung, code: 'XAR24DYFAAWKNAZ' })).toBeNull();
  });
  it('limita E1/E2 à linha eletrônica Philco, sem inventar o sensor', () => {
    const philco = { ...daikin, brand: { name: 'Philco' }, code: 'PAJ10FH' };
    expect(getReferenceErrorCodes(philco).map(({ code, title }) => [code, title])).toEqual([['E1', 'Falha em sensor'], ['E2', 'Falha em sensor']]);
    expect(getEquipmentCodeReference(philco)).toMatchObject({ page: 19, distributorCopy: true });
    for (const code of ['PAJ7FH', 'PAJ12FH', 'PAJ18FH', 'PAJ24FH']) expect(getReferenceErrorCodes({ ...philco, code })).toHaveLength(2);
    for (const code of ['PAJ7FA', 'PAJ10FA', 'PAJ9FH', 'PAJ10F']) expect(getReferenceErrorCodes({ ...philco, code })).toHaveLength(0);
  });
  it('respeita códigos distintos em FFQ e nas externas Multi PMVM', () => {
    const ffq = { ...daikin, code: 'FFQ25KVL' };
    const multi = { ...daikin, code: '3MXS18PMVM' };
    expect(getReferenceErrorCodes(ffq).find(entry => entry.code === 'UA')?.title).toBe('Configuração de campo incorreta');
    expect(getReferenceErrorCodes(multi).find(entry => entry.code === 'UA')?.title).toContain('Tensão não especificada');
    expect(getEquipmentCodeReference({ ...daikin, code: '2MXS18PMVM' })).toBeNull();
    expect(getEquipmentCodeReference({ ...daikin, code: '3MKC18S5VL' })).toBeNull();
    expect(getEquipmentCodeReference({ ...daikin, code: '2MXC18RMVM' })?.id).toBe('daikin-lite-2mxc-r');
  });
  it('separa operação FDMQA de indicações de comissionamento VRV W', () => {
    expect(getReferenceErrorCodes({ ...daikin, code: 'FDMQA30A5VL' })).toHaveLength(54);
    expect(getEquipmentCodeReference({ ...daikin, code: 'FCQA30A5VL' })).toBeNull();
    const waterVrv = { ...daikin, code: 'RWEYQ8TYM' };
    expect(getEquipmentCodeReference(waterVrv)?.context).toBe('commissioning');
    expect(getReferenceErrorCodes(waterVrv)).toHaveLength(6);
    expect(getReferenceErrorCodes(waterVrv).find(entry => entry.code === 'U4')?.title).toContain('teste inicial');
    expect(getEquipmentCodeReference({ ...waterVrv, code: 'RWEYQ8PYL' })).toBeNull();
    expect(getEquipmentCodeReference({ ...waterVrv, brand: { name: 'Outra' } })).toBeNull();
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
