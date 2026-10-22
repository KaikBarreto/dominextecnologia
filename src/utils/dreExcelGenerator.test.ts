import { describe, expect, it } from 'vitest';
import { buildDreExcelSheets, createDreExcelWorkbook } from './dreExcelGenerator';
import type { DreReportData } from './dreHtmlGenerator';

const report: DreReportData = {
  company: { name: 'Dominex DEMO', document: '00.000.000/0001-00' },
  period: '01/09/2026 a 30/09/2026',
  regime: 'competencia',
  currency: 'BRL',
  receitaBruta: 10_000,
  receitaCategories: [{
    name: 'Serviços',
    value: 10_000,
    color: '#000',
    children: [{ name: 'Contratos PMOC', value: 10_000, color: '#000', code: '01.01.001.001' }],
    costCenters: [{ name: 'Operação', value: 10_000 }],
  }],
  impostos: 1_000,
  impostosCategories: [{ name: 'ISS', value: 1_000, color: '#000' }],
  receitaLiquida: 9_000,
  cpv: 2_000,
  cpvCategories: [{ name: 'Materiais', value: 2_000, color: '#000' }],
  lucroBruto: 7_000,
  opex: 3_000,
  opexCategories: [{ name: 'Aluguel', value: 3_000, color: '#000' }],
  resultadoLiquido: 4_000,
  naoOperacional: 500,
  naoOperacionalCategories: [{ name: 'Juros', value: 500, color: '#000' }],
  resultadoFinal: 3_500,
  margem: 70,
  costCenters: [
    { name: 'Operação', color: '#000', revenue: 10_000, expense: 6_000, result: 4_000 },
    { name: 'Administrativo', color: '#000', revenue: 0, expense: 500, result: -500 },
  ],
};

describe('buildDreExcelSheets', () => {
  it('mantém totais oficiais e exibe linhas subtrativas sem sinal duplicado', () => {
    const sheets = buildDreExcelSheets(report);
    const dre = sheets[0];

    expect(dre.rows).toContainEqual(['Empresa', 'Dominex DEMO', '']);
    expect(dre.rows).toContainEqual(['CNPJ/CPF', '00.000.000/0001-00', '']);
    expect(dre.rows).toContainEqual(['Período', '01/09/2026 a 30/09/2026', '']);
    expect(dre.rows).toContainEqual(['Regime', 'Competência', '']);
    expect(dre.rows).toContainEqual(['01.01.001 - Serviços', 10_000, 1]);
    expect(dre.rows).toContainEqual(['01.01.001.001 - Contratos PMOC', 10_000, 1]);
    expect(dre.rows.some((row) => String(row[0]).includes('Centro de custo'))).toBe(false);
    expect(dre.rows).toContainEqual(['02.01.001 - ISS', 1_000, 0.1]);
    expect(dre.rows).toContainEqual(['07 - RESULTADO OPERACIONAL', 4_000, 0.4]);
    expect(dre.rows).toContainEqual(['08.01.001 - Juros', 500, 0.05]);
    expect(dre.rows).toContainEqual(['09 - RESULTADO FINAL', 3_500, 0.35]);

    expect(dre.rowKinds).toHaveLength(dre.rows.length);
    expect(dre.outlineLevels).toHaveLength(dre.rows.length);
    expect(dre.outlineLevels).toContain(2);
    expect(dre.autoFilter).toEqual({ from: 'A10', to: `C${dre.rows.length}` });
    expect(dre.freezePane).toEqual({ xSplit: 1, ySplit: 10, topLeftCell: 'B11' });
    expect(dre.currencyColumns).toEqual([2]);
    expect(dre.percentageColumns).toEqual([3]);
  });

  it('gera aba de centros de custo com total e percentual sobre a receita bruta', () => {
    const costCenters = buildDreExcelSheets(report)[1];

    expect(costCenters.name).toBe('Centros de custo');
    expect(costCenters.rows).toContainEqual(['Operação', 10_000, 6_000, 4_000, 0.4]);
    expect(costCenters.rows).toContainEqual(['Administrativo', 0, 500, -500, -0.05]);
    expect(costCenters.rows.at(-1)).toEqual(['TOTAL GERAL', 10_000, 6_500, 3_500, 0.35]);
    expect(costCenters.mergedRanges).toContain('A1:E1');
    expect(costCenters.freezePane).toEqual({ xSplit: 1, ySplit: 6, topLeftCell: 'B7' });
  });

  it('gera comparativo com valores, variação absoluta, percentual e base zero explícita', () => {
    const sheets = buildDreExcelSheets({
      ...report,
      comparison: {
        currentPeriod: '01/09/2026 a 30/09/2026',
        comparisonPeriod: '01/08/2026 a 31/08/2026',
        rows: [
          { code: '01', label: 'Receita Bruta', current: 10_000, previous: 8_000, absolute: 2_000, percentage: 0.25 },
          { code: '09', label: 'Resultado Final', current: 3_500, previous: 0, absolute: 3_500, percentage: null },
        ],
      },
    });
    const comparison = sheets.find((sheet) => sheet.name === 'Comparativo');

    expect(comparison).toBeDefined();
    expect(comparison!.rows).toContainEqual(['01', 'Receita Bruta', 10_000, 8_000, 2_000, 0.25]);
    expect(comparison!.rows).toContainEqual(['09', 'Resultado Final', 3_500, 0, 3_500, '']);
    expect(comparison!.freezePane).toEqual({ xSplit: 2, ySplit: 6, topLeftCell: 'C7' });
    expect(comparison!.currencyColumns).toEqual([3, 4, 5]);
    expect(comparison!.percentageColumns).toEqual([6]);
  });

  it('usa os grupos configuráveis por natureza, preserva sua ordem e omite excluídos', () => {
    const sheets = buildDreExcelSheets({
      ...report,
      groups: [
        { id: 'rev-b', code: '03', name: 'Receitas recorrentes', nature: 'revenue', total: 6_000, categories: [{ name: 'PMOC', code: '017', value: 6_000, color: '#000' }] },
        { id: 'rev-a', name: 'Receitas avulsas', nature: 'revenue', total: 4_000, categories: [{ name: 'Instalação', value: 4_000, color: '#000' }] },
        { id: 'tax', name: 'Tributos', nature: 'deduction', total: 1_000, categories: [{ name: 'ISS', value: 1_000, color: '#000' }] },
        { id: 'hidden', name: 'Transferências', nature: 'excluded', total: 999, categories: [{ name: 'Interna', value: 999, color: '#000' }] },
        { id: 'other', name: 'Despesas financeiras', nature: 'non_operating', total: 500, categories: [{ name: 'Juros', value: 500, color: '#000' }] },
      ],
    })[0];

    const recurringIndex = sheets.rows.findIndex((row) => row[0] === '01.03 - RECEITAS RECORRENTES');
    const oneOffIndex = sheets.rows.findIndex((row) => row[0] === '01.02 - RECEITAS AVULSAS');
    expect(recurringIndex).toBeGreaterThan(0);
    expect(oneOffIndex).toBeGreaterThan(recurringIndex);
    expect(sheets.rows).toContainEqual(['01.03.017 - PMOC', 6_000, 0.6]);
    expect(sheets.rows).toContainEqual(['02.01.001 - ISS', 1_000, 0.1]);
    expect(sheets.rows).toContainEqual(['08.01.001 - Juros', 500, 0.05]);
    expect(sheets.rows.some((row) => String(row[0]).includes('TRANSFERÊNCIAS'))).toBe(false);
    expect(sheets.rows.filter((row) => row[0] === '01 - RECEITA BRUTA')).toHaveLength(1);
  });

  it('arredonda valores positivos e negativos na precisão da moeda e rejeita não finitos', () => {
    const rounded = buildDreExcelSheets({
      ...report,
      receitaBruta: 1_000.005,
      receitaCategories: [{ name: 'Serviços', value: 1_000.005, color: '#000' }],
      impostos: 10.005,
      impostosCategories: [{ name: 'ISS', value: 10.005, color: '#000' }],
    })[0];

    expect(rounded.rows.find((row) => row[0] === '01.01.001 - Serviços')?.[1]).toBe(1_000.01);
    expect(rounded.rows.find((row) => row[0] === '02.01.001 - ISS')?.[1]).toBe(10.01);
    expect(() => buildDreExcelSheets({ ...report, receitaBruta: Number.NaN })).toThrow('valor monetário inválido');
  });
});

describe('createDreExcelWorkbook', () => {
  it('materializa estilos, formatos, filtros e painéis congelados sem navegador', async () => {
    const workbook = await createDreExcelWorkbook(report);
    const dre = workbook.getWorksheet('DRE');
    const costCenters = workbook.getWorksheet('Centros de custo');

    expect(dre).toBeDefined();
    expect(costCenters).toBeDefined();
    expect(dre!.getCell('A1').font.bold).toBe(true);
    expect(dre!.getCell('A1').fill).toMatchObject({ pattern: 'solid', fgColor: { argb: 'FF172033' } });
    const revenueCategoryRow = dre!.getColumn(1).values.findIndex((value) => value === '01.01.001 - Serviços');
    expect(revenueCategoryRow).toBeGreaterThan(10);
    expect(dre!.getCell(revenueCategoryRow, 2).numFmt).toContain('R$');
    expect(dre!.getCell(revenueCategoryRow, 3).numFmt).toContain('0.0%');
    expect(dre!.autoFilter).toBe(`A10:C${dre!.rowCount}`);
    expect(dre!.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 10, topLeftCell: 'B11' });
    expect(dre!.getColumn(1).width).toBe(72);
    expect(costCenters!.getColumn(1).width).toBe(38);
    expect(costCenters!.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 6 });

    const taxRow = dre!.getColumn(1).values.findIndex((value) => value === '02.01.001 - ISS');
    const operatingResultRow = dre!.getColumn(1).values.findIndex((value) => value === '07 - RESULTADO OPERACIONAL');
    const finalResultRow = dre!.getColumn(1).values.findIndex((value) => value === '09 - RESULTADO FINAL');
    expect(dre!.getCell(taxRow, 2).font.color).toMatchObject({ argb: 'FF334155' });
    expect(dre!.getCell(operatingResultRow, 1).fill).toMatchObject({ fgColor: { argb: 'FF172033' } });
    expect(dre!.getCell(finalResultRow, 1).fill).toMatchObject({ fgColor: { argb: 'FF15803D' } });

    const serialized = await workbook.xlsx.writeBuffer();
    const ExcelJS = await import('exceljs');
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(serialized);
    expect(reopened.getWorksheet('DRE')!.getCell(revenueCategoryRow, 1).value).toBe('01.01.001 - Serviços');
    expect(reopened.getWorksheet('DRE')!.getCell(revenueCategoryRow, 2).numFmt).toContain('R$');
  });
});
