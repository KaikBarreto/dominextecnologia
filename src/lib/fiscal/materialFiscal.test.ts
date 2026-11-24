import { describe, expect, it } from 'vitest';
import {
  missingMaterialFiscalFields,
  normalizeMaterialFiscalFields,
  validateMaterialFiscalFields,
} from './materialFiscal';

describe('materialFiscal', () => {
  it('normaliza formato sem inventar classificação', () => {
    expect(normalizeMaterialFiscalFields({ fiscal_ncm: '12.34.56-78', fiscal_tax_unit: ' un ' })).toMatchObject({
      fiscal_ncm: '12345678', fiscal_tax_unit: 'UN', fiscal_origin: null,
    });
  });

  it('devolve erro acionável antes do banco', () => {
    expect(validateMaterialFiscalFields({ fiscal_ncm: '1234' })).toBe('O NCM precisa ter 8 dígitos.');
    expect(validateMaterialFiscalFields({ fiscal_gtin: '123456789' })).toContain('8, 12, 13 ou 14');
  });

  it('separa campo opcional de campo mínimo para emissão', () => {
    const missing = missingMaterialFiscalFields({
      fiscal_ncm: '12345678', fiscal_origin: '0', fiscal_cfop_internal: '5102',
      fiscal_cfop_interstate: '6102', fiscal_icms_code: '102', fiscal_pis_cst: '49',
      fiscal_cfop_entry_internal: '1102', fiscal_cfop_entry_interstate: '2102',
      fiscal_cfop_exit_internal: '5102', fiscal_cfop_exit_interstate: '6102',
      fiscal_cofins_cst: '49', fiscal_tax_unit: 'UN',
    });
    expect(missing).toEqual([]);
  });
});
