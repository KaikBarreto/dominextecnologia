import type { InventoryItemInsert } from '@/hooks/useInventory';

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export type MaterialFiscalField =
  | 'fiscal_ncm'
  | 'fiscal_cest'
  | 'fiscal_gtin'
  | 'fiscal_origin'
  | 'fiscal_cfop_internal'
  | 'fiscal_cfop_interstate'
  | 'fiscal_cfop_entry_internal'
  | 'fiscal_cfop_entry_interstate'
  | 'fiscal_cfop_exit_internal'
  | 'fiscal_cfop_exit_interstate'
  | 'fiscal_icms_code'
  | 'fiscal_icms_rate'
  | 'fiscal_icms_reduction_rate'
  | 'fiscal_pis_cst'
  | 'fiscal_cofins_cst'
  | 'fiscal_ipi_cst'
  | 'fiscal_ipi_rate'
  | 'fiscal_pis_rate'
  | 'fiscal_cofins_rate'
  | 'fiscal_tax_unit'
  | 'fiscal_ibs_cbs_cst';

export const MATERIAL_FISCAL_FIELDS: MaterialFiscalField[] = [
  'fiscal_ncm', 'fiscal_cest', 'fiscal_gtin', 'fiscal_origin',
  'fiscal_cfop_internal', 'fiscal_cfop_interstate',
  'fiscal_cfop_entry_internal', 'fiscal_cfop_entry_interstate',
  'fiscal_cfop_exit_internal', 'fiscal_cfop_exit_interstate', 'fiscal_icms_code',
  'fiscal_icms_rate', 'fiscal_icms_reduction_rate',
  'fiscal_pis_cst', 'fiscal_cofins_cst', 'fiscal_ipi_cst',
  'fiscal_pis_rate', 'fiscal_cofins_rate', 'fiscal_ipi_rate',
  'fiscal_tax_unit', 'fiscal_ibs_cbs_cst',
];

/** Normaliza somente formato; classificação tributária nunca é inferida. */
export function normalizeMaterialFiscalFields(
  source: Partial<InventoryItemInsert>,
): Pick<InventoryItemInsert, MaterialFiscalField> {
  const text = (field: MaterialFiscalField) => {
    const value = source[field];
    return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
  };
  const rate = (field: MaterialFiscalField) => {
    const raw = source[field];
    if (raw == null || raw === '') return null;
    const value = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  };
  return {
    fiscal_ncm: digits(source.fiscal_ncm) || null,
    fiscal_cest: digits(source.fiscal_cest) || null,
    fiscal_gtin: digits(source.fiscal_gtin) || null,
    fiscal_origin: digits(source.fiscal_origin) || null,
    fiscal_cfop_internal: digits(source.fiscal_cfop_internal) || null,
    fiscal_cfop_interstate: digits(source.fiscal_cfop_interstate) || null,
    fiscal_cfop_entry_internal: digits(source.fiscal_cfop_entry_internal) || null,
    fiscal_cfop_entry_interstate: digits(source.fiscal_cfop_entry_interstate) || null,
    fiscal_cfop_exit_internal: digits(source.fiscal_cfop_exit_internal ?? source.fiscal_cfop_internal) || null,
    fiscal_cfop_exit_interstate: digits(source.fiscal_cfop_exit_interstate ?? source.fiscal_cfop_interstate) || null,
    fiscal_icms_code: digits(source.fiscal_icms_code) || null,
    fiscal_icms_rate: rate('fiscal_icms_rate'),
    fiscal_icms_reduction_rate: rate('fiscal_icms_reduction_rate'),
    fiscal_pis_cst: digits(source.fiscal_pis_cst) || null,
    fiscal_cofins_cst: digits(source.fiscal_cofins_cst) || null,
    fiscal_ipi_cst: digits(source.fiscal_ipi_cst) || null,
    fiscal_pis_rate: rate('fiscal_pis_rate'),
    fiscal_cofins_rate: rate('fiscal_cofins_rate'),
    fiscal_ipi_rate: rate('fiscal_ipi_rate'),
    fiscal_tax_unit: text('fiscal_tax_unit'),
    fiscal_ibs_cbs_cst: text('fiscal_ibs_cbs_cst'),
  };
}

export function validateMaterialFiscalFields(source: Partial<InventoryItemInsert>): string | null {
  const value = normalizeMaterialFiscalFields(source);
  const checks: Array<[unknown, RegExp, string]> = [
    [value.fiscal_ncm, /^\d{8}$/, 'O NCM precisa ter 8 dígitos.'],
    [value.fiscal_cest, /^\d{7}$/, 'O CEST precisa ter 7 dígitos.'],
    [value.fiscal_gtin, /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/, 'O GTIN precisa ter 8, 12, 13 ou 14 dígitos.'],
    [value.fiscal_origin, /^[0-8]$/, 'A origem da mercadoria é inválida.'],
    [value.fiscal_cfop_internal, /^[1-7]\d{3}$/, 'O CFOP dentro do estado precisa ter 4 dígitos.'],
    [value.fiscal_cfop_interstate, /^[1-7]\d{3}$/, 'O CFOP interestadual precisa ter 4 dígitos.'],
    [value.fiscal_cfop_entry_internal, /^[1-3]\d{3}$/, 'O CFOP de entrada dentro do estado precisa começar com 1, 2 ou 3.'],
    [value.fiscal_cfop_entry_interstate, /^[1-3]\d{3}$/, 'O CFOP de entrada interestadual precisa começar com 1, 2 ou 3.'],
    [value.fiscal_cfop_exit_internal, /^[5-7]\d{3}$/, 'O CFOP de saída dentro do estado precisa começar com 5, 6 ou 7.'],
    [value.fiscal_cfop_exit_interstate, /^[5-7]\d{3}$/, 'O CFOP de saída interestadual precisa começar com 5, 6 ou 7.'],
    [value.fiscal_icms_code, /^\d{2,3}$/, 'O CST/CSOSN precisa ter 2 ou 3 dígitos.'],
    [value.fiscal_pis_cst, /^\d{2}$/, 'O CST de PIS precisa ter 2 dígitos.'],
    [value.fiscal_cofins_cst, /^\d{2}$/, 'O CST de COFINS precisa ter 2 dígitos.'],
    [value.fiscal_ipi_cst, /^\d{2}$/, 'O CST de IPI precisa ter 2 dígitos.'],
  ];
  for (const [entry, pattern, message] of checks) {
    if (entry != null && !pattern.test(String(entry))) return message;
  }
  for (const [entry, label] of [
    [value.fiscal_icms_rate, 'ICMS'], [value.fiscal_icms_reduction_rate, 'redução de ICMS'],
    [value.fiscal_pis_rate, 'PIS'], [value.fiscal_cofins_rate, 'COFINS'], [value.fiscal_ipi_rate, 'IPI'],
  ] as Array<[number | null | undefined, string]>) {
    if (entry != null && (entry < 0 || entry > 100)) return `A alíquota de ${label} precisa ficar entre 0% e 100%.`;
  }
  return null;
}

/** Campos mínimos para um item entrar em NF-e/NFC-e sem classificação por palpite. */
export function missingMaterialFiscalFields(source: Partial<InventoryItemInsert>): string[] {
  const value = normalizeMaterialFiscalFields(source);
  const required: Array<[unknown, string]> = [
    [value.fiscal_ncm, 'NCM'],
    [value.fiscal_origin, 'Origem'],
    [value.fiscal_cfop_entry_internal, 'CFOP de entrada dentro do estado'],
    [value.fiscal_cfop_entry_interstate, 'CFOP de entrada interestadual'],
    [value.fiscal_cfop_exit_internal, 'CFOP de saída dentro do estado'],
    [value.fiscal_cfop_exit_interstate, 'CFOP de saída interestadual'],
    [value.fiscal_icms_code, 'CST/CSOSN'],
    [value.fiscal_pis_cst, 'CST de PIS'],
    [value.fiscal_cofins_cst, 'CST de COFINS'],
    [value.fiscal_tax_unit, 'Unidade tributável'],
  ];
  const icmsTaxed = value.fiscal_icms_code != null && !['40', '41', '50', '102', '103', '300', '400'].includes(value.fiscal_icms_code);
  const pisTaxed = value.fiscal_pis_cst != null && !['04', '05', '06', '07', '08', '09', '49'].includes(value.fiscal_pis_cst);
  const cofinsTaxed = value.fiscal_cofins_cst != null && !['04', '05', '06', '07', '08', '09', '49'].includes(value.fiscal_cofins_cst);
  if (icmsTaxed) required.push([value.fiscal_icms_rate, 'Alíquota de ICMS']);
  if (pisTaxed) required.push([value.fiscal_pis_rate, 'Alíquota de PIS']);
  if (cofinsTaxed) required.push([value.fiscal_cofins_rate, 'Alíquota de COFINS']);
  return required.filter(([entry]) => !entry).map(([, label]) => label);
}
