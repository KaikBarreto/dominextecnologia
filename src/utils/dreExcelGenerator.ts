import type { DreExportCategory, DreExportGroup, DreReportData } from '@/utils/dreHtmlGenerator';

type DreExcelCell = string | number;

export type DreExcelRowKind =
  | 'title'
  | 'metadata'
  | 'spacer'
  | 'header'
  | 'detail'
  | 'subtotal'
  | 'calculated'
  | 'result';

export interface DreExcelSheet {
  name: string;
  rows: DreExcelCell[][];
  widths: number[];
  rowKinds: DreExcelRowKind[];
  outlineLevels: number[];
  mergedRanges: string[];
  headerRow: number;
  autoFilter: { from: string; to: string };
  freezePane: { xSplit: number; ySplit: number; topLeftCell: string };
  currencyColumns: number[];
  percentageColumns: number[];
  tabColor: string;
}

type ExcelWorkbook = import('exceljs').Workbook;
type ExcelWorksheet = import('exceljs').Worksheet;

const COLORS = {
  navy: 'FF172033',
  slate: 'FF334155',
  muted: 'FF64748B',
  border: 'FFE2E8F0',
  zebra: 'FFF8FAFC',
  subtotal: 'FFEFF6F4',
  calculated: 'FFDDF8EF',
  positive: 'FF15803D',
  negative: 'FFB91C1C',
  white: 'FFFFFFFF',
  brand: 'FF00A77E',
  brandLight: 'FFD7F5EC',
} as const;

const NATURE_CODES: Record<Exclude<DreExportGroup['nature'], 'excluded'>, string> = {
  revenue: '01',
  deduction: '02',
  cost: '04',
  operating_expense: '06',
  non_operating: '08',
};

function normalizedCurrency(currency?: string | null): string {
  const normalized = currency?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : 'BRL';
}

function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

function roundMoney(value: number, fractionDigits: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('O DRE contém um valor monetário inválido e não pode ser exportado.');
  }
  const factor = 10 ** fractionDigits;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor;
}

function percentOfRevenue(value: number, revenue: number): number | '' {
  if (!Number.isFinite(value) || !Number.isFinite(revenue) || revenue === 0) return '';
  return value / revenue;
}

function signedGroupValue(value: number, nature: DreExportGroup['nature']): number {
  if (nature === 'revenue') return Math.abs(value);
  if (nature === 'excluded') return 0;
  return -Math.abs(value);
}

function childCode(parentCode: string, configuredCode: string | undefined, fallback: string): string {
  const child = configuredCode?.trim() || fallback;
  if (configuredCode && (child === parentCode || child.startsWith(`${parentCode}.`))) return child;
  return `${parentCode}.${child}`;
}

interface SheetRowsBuilder {
  rows: DreExcelCell[][];
  kinds: DreExcelRowKind[];
  outlineLevels: number[];
  add: (row: DreExcelCell[], kind: DreExcelRowKind, outlineLevel?: number) => void;
}

function createRowsBuilder(initialRows: DreExcelCell[][], initialKinds: DreExcelRowKind[]): SheetRowsBuilder {
  const rows = [...initialRows];
  const kinds = [...initialKinds];
  const outlineLevels = initialRows.map(() => 0);

  return {
    rows,
    kinds,
    outlineLevels,
    add(row, kind, outlineLevel = 0) {
      rows.push(row);
      kinds.push(kind);
      outlineLevels.push(outlineLevel);
    },
  };
}

function addCategoryGroup(
  builder: SheetRowsBuilder,
  groupName: string,
  categories: DreExportCategory[],
  total: number,
  nature: DreExportGroup['nature'],
  grossRevenue: number,
  fractionDigits: number,
  configuredGroupCode?: string,
  groupIndex = 0,
): void {
  const natureCode = NATURE_CODES[nature as Exclude<DreExportGroup['nature'], 'excluded'>];
  const groupCode = childCode(natureCode, configuredGroupCode, String(groupIndex + 1).padStart(2, '0'));

  categories.forEach((category, categoryIndex) => {
    const value = roundMoney(signedGroupValue(category.value, nature), fractionDigits);
    const categoryCode = childCode(groupCode, category.code, String(categoryIndex + 1).padStart(3, '0'));
    builder.add([categoryCode, groupName, category.name, value, percentOfRevenue(Math.abs(value), grossRevenue)], 'detail', 1);
  });

  const signedTotal = roundMoney(signedGroupValue(total, nature), fractionDigits);
  builder.add([groupCode, groupName, 'Total do grupo', signedTotal, percentOfRevenue(Math.abs(signedTotal), grossRevenue)], 'subtotal');
}

function addCalculatedRow(
  builder: SheetRowsBuilder,
  label: string,
  value: number,
  grossRevenue: number,
  fractionDigits: number,
  kind: 'calculated' | 'result' = 'calculated',
  code = '',
): void {
  const rounded = roundMoney(value, fractionDigits);
  builder.add([code, label, 'Total calculado', rounded, percentOfRevenue(rounded, grossRevenue)], kind);
}

function addGroupsByNature(
  builder: SheetRowsBuilder,
  groups: DreExportGroup[],
  nature: DreExportGroup['nature'],
  grossRevenue: number,
  fractionDigits: number,
): void {
  groups
    .filter((group) => group.nature === nature)
    .forEach((group, groupIndex) => addCategoryGroup(
      builder,
      group.name,
      group.categories ?? [],
      group.total,
      group.nature,
      grossRevenue,
      fractionDigits,
      group.code,
      groupIndex,
    ));
}

function buildDreRows(data: DreReportData, fractionDigits: number): SheetRowsBuilder {
  const regime = data.regime === 'competencia' ? 'Competência' : 'Caixa';
  const currency = normalizedCurrency(data.currency);
  const builder = createRowsBuilder(
    [
      ['DEMONSTRATIVO DE RESULTADO DO EXERCÍCIO'],
      ['Empresa', data.company.name, '', 'Período', data.period],
      ['CNPJ/CPF', data.company.document ?? 'Não informado', '', 'Regime', regime],
      ['Moeda', currency, '', 'Base percentual', 'Receita bruta'],
      [],
      ['Código', 'Grupo', 'Categoria / indicador', 'Valor', '% da receita bruta'],
    ],
    ['title', 'metadata', 'metadata', 'metadata', 'spacer', 'header'],
  );
  const grossRevenue = roundMoney(data.receitaBruta, fractionDigits);
  const groups = (data.groups ?? []).filter((group) => group.nature !== 'excluded');

  if (groups.length) {
    addGroupsByNature(builder, groups, 'revenue', grossRevenue, fractionDigits);
    addCalculatedRow(builder, 'Receita Bruta', data.receitaBruta, grossRevenue, fractionDigits, 'calculated', '01');

    addGroupsByNature(builder, groups, 'deduction', grossRevenue, fractionDigits);
    addCalculatedRow(builder, 'Receita Líquida', data.receitaLiquida, grossRevenue, fractionDigits, 'calculated', '03');

    addGroupsByNature(builder, groups, 'cost', grossRevenue, fractionDigits);
    addCalculatedRow(builder, 'Lucro Bruto', data.lucroBruto, grossRevenue, fractionDigits, 'calculated', '05');

    addGroupsByNature(builder, groups, 'operating_expense', grossRevenue, fractionDigits);
    addCalculatedRow(builder, 'Resultado Operacional (EBITDA)', data.resultadoLiquido, grossRevenue, fractionDigits, 'result', '07');

    addGroupsByNature(builder, groups, 'non_operating', grossRevenue, fractionDigits);
  } else {
    addCategoryGroup(
      builder,
      'Receita Bruta',
      data.receitaCategories ?? [],
      data.receitaBruta,
      'revenue',
      grossRevenue,
      fractionDigits,
      undefined,
      0,
    );
    addCategoryGroup(
      builder,
      'Impostos e Deduções',
      data.impostosCategories ?? [],
      data.impostos,
      'deduction',
      grossRevenue,
      fractionDigits,
      undefined,
      0,
    );
    addCalculatedRow(builder, 'Receita Líquida', data.receitaLiquida, grossRevenue, fractionDigits, 'calculated', '03');

    addCategoryGroup(
      builder,
      'Custos dos Serviços Prestados',
      data.cpvCategories ?? [],
      data.cpv,
      'cost',
      grossRevenue,
      fractionDigits,
      undefined,
      0,
    );
    addCalculatedRow(builder, 'Lucro Bruto', data.lucroBruto, grossRevenue, fractionDigits, 'calculated', '05');

    addCategoryGroup(
      builder,
      'Despesas Operacionais',
      data.opexCategories ?? [],
      data.opex,
      'operating_expense',
      grossRevenue,
      fractionDigits,
      undefined,
      0,
    );
    addCalculatedRow(builder, 'Resultado Operacional (EBITDA)', data.resultadoLiquido, grossRevenue, fractionDigits, 'result', '07');

    if (data.naoOperacional !== undefined || data.naoOperacionalCategories?.length) {
      const total = data.naoOperacional
        ?? (data.naoOperacionalCategories ?? []).reduce((sum, category) => sum + Math.abs(category.value), 0);
      addCategoryGroup(
        builder,
        'Despesas não operacionais',
        data.naoOperacionalCategories ?? [],
        total,
        'non_operating',
        grossRevenue,
        fractionDigits,
        undefined,
        0,
      );
    }
  }

  if (data.resultadoFinal !== undefined) {
    addCalculatedRow(builder, 'Resultado Final', data.resultadoFinal, grossRevenue, fractionDigits, 'result', '09');
  }

  return builder;
}

function buildCostCenterRows(data: DreReportData, fractionDigits: number): SheetRowsBuilder {
  const regime = data.regime === 'competencia' ? 'Competência' : 'Caixa';
  const currency = normalizedCurrency(data.currency);
  const builder = createRowsBuilder(
    [
      ['ANÁLISE POR CENTRO DE CUSTO'],
      ['Empresa', data.company.name, 'Período', data.period],
      ['CNPJ/CPF', data.company.document ?? 'Não informado', 'Regime', regime],
      ['Moeda', currency, 'Base percentual', 'Receita bruta'],
      [],
      ['Centro de custo', 'Receitas', 'Despesas', 'Resultado', '% da receita bruta'],
    ],
    ['title', 'metadata', 'metadata', 'metadata', 'spacer', 'header'],
  );

  let totalRevenue = 0;
  let totalExpense = 0;
  let totalResult = 0;

  const grossRevenue = roundMoney(data.receitaBruta, fractionDigits);

  for (const center of data.costCenters ?? []) {
    const revenue = roundMoney(center.revenue, fractionDigits);
    const expense = roundMoney(-Math.abs(center.expense), fractionDigits);
    const result = roundMoney(center.result, fractionDigits);
    totalRevenue += revenue;
    totalExpense += expense;
    totalResult += result;
    builder.add([center.name, revenue, expense, result, percentOfRevenue(result, grossRevenue)], 'detail');
  }

  totalRevenue = roundMoney(totalRevenue, fractionDigits);
  totalExpense = roundMoney(totalExpense, fractionDigits);
  totalResult = roundMoney(totalResult, fractionDigits);
  builder.add(
    ['TOTAL GERAL', totalRevenue, totalExpense, totalResult, percentOfRevenue(totalResult, grossRevenue)],
    'result',
  );

  return builder;
}

function buildComparisonRows(data: DreReportData, fractionDigits: number): SheetRowsBuilder | undefined {
  if (!data.comparison?.rows.length) return undefined;

  const regime = data.regime === 'competencia' ? 'Competência' : 'Caixa';
  const currency = normalizedCurrency(data.currency);
  const builder = createRowsBuilder(
    [
      ['COMPARATIVO ENTRE PERÍODOS'],
      ['Empresa', data.company.name, '', 'Regime', regime, ''],
      ['Período atual', data.comparison.currentPeriod, '', 'Comparativo', data.comparison.comparisonPeriod, ''],
      ['Moeda', currency, '', 'Base da variação', 'Período comparativo', ''],
      [],
      ['Código', 'Indicador', 'Período atual', 'Comparativo', 'Variação absoluta', 'Variação %'],
    ],
    ['title', 'metadata', 'metadata', 'metadata', 'spacer', 'header'],
  );

  for (const row of data.comparison.rows) {
    const kind: DreExcelRowKind = ['07', '09'].includes(row.code)
      ? 'result'
      : ['03', '05'].includes(row.code)
        ? 'calculated'
        : 'detail';
    builder.add([
      row.code,
      row.label,
      roundMoney(row.current, fractionDigits),
      roundMoney(row.previous, fractionDigits),
      roundMoney(row.absolute, fractionDigits),
      row.percentage ?? '',
    ], kind);
  }

  return builder;
}

/**
 * Monta uma representação pura do relatório. Ela concentra dados e metadados
 * de layout para o Excel e permite testar o contrato sem navegador.
 */
export function buildDreExcelSheets(data: DreReportData): DreExcelSheet[] {
  const currency = normalizedCurrency(data.currency);
  const fractionDigits = currencyFractionDigits(currency);
  const dre = buildDreRows(data, fractionDigits);
  const dreLastRow = dre.rows.length;

  const sheets: DreExcelSheet[] = [{
    name: 'DRE',
    rows: dre.rows,
    widths: [15, 30, 38, 20, 22],
    rowKinds: dre.kinds,
    outlineLevels: dre.outlineLevels,
    mergedRanges: ['A1:E1', 'B2:C2', 'B3:C3', 'B4:C4'],
    headerRow: 6,
    autoFilter: { from: 'A6', to: `E${dreLastRow}` },
    freezePane: { xSplit: 0, ySplit: 6, topLeftCell: 'A7' },
    currencyColumns: [4],
    percentageColumns: [5],
    tabColor: COLORS.brand,
  }];

  const comparison = buildComparisonRows(data, fractionDigits);
  if (comparison) {
    sheets.push({
      name: 'Comparativo',
      rows: comparison.rows,
      widths: [14, 38, 20, 20, 22, 16],
      rowKinds: comparison.kinds,
      outlineLevels: comparison.outlineLevels,
      mergedRanges: ['A1:F1', 'B2:C2', 'B3:C3', 'B4:C4'],
      headerRow: 6,
      autoFilter: { from: 'A6', to: `F${comparison.rows.length}` },
      freezePane: { xSplit: 2, ySplit: 6, topLeftCell: 'C7' },
      currencyColumns: [3, 4, 5],
      percentageColumns: [6],
      tabColor: COLORS.brandLight,
    });
  }

  if (data.costCenters?.length) {
    const costCenters = buildCostCenterRows(data, fractionDigits);
    sheets.push({
      name: 'Centros de custo',
      rows: costCenters.rows,
      widths: [38, 19, 19, 19, 15],
      rowKinds: costCenters.kinds,
      outlineLevels: costCenters.outlineLevels,
      mergedRanges: ['A1:E1', 'D2:E2', 'D3:E3', 'D4:E4'],
      headerRow: 6,
      autoFilter: { from: 'A6', to: `E${costCenters.rows.length}` },
      freezePane: { xSplit: 1, ySplit: 6, topLeftCell: 'B7' },
      currencyColumns: [2, 3, 4],
      percentageColumns: [5],
      tabColor: COLORS.slate,
    });
  }

  return sheets;
}

function currencyNumberFormat(currency: string, fractionDigits: number): string {
  const decimals = fractionDigits ? `.${'0'.repeat(fractionDigits)}` : '';
  return `"${currency}" #,##0${decimals};[Red]-"${currency}" #,##0${decimals};-`;
}

function styleRow(worksheet: ExcelWorksheet, rowNumber: number, kind: DreExcelRowKind, columnCount: number): void {
  const row = worksheet.getRow(rowNumber);
  row.height = kind === 'title' ? 34 : kind === 'header' ? 25 : kind === 'spacer' ? 9 : 21;

  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    cell.font = { name: 'Aptos', size: 10, color: { argb: COLORS.slate } };
    cell.alignment = { vertical: 'middle', horizontal: columnNumber >= columnCount - 1 ? 'right' : 'left' };

    if (kind !== 'spacer' && kind !== 'title') {
      cell.border = { bottom: { style: 'hair', color: { argb: COLORS.border } } };
    }

    if (kind === 'title') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
      cell.font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: COLORS.white } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    } else if (kind === 'metadata') {
      const metadataLabels = [
        'Empresa',
        'CNPJ/CPF',
        'Moeda',
        'Período',
        'Período atual',
        'Comparativo',
        'Regime',
        'Base percentual',
        'Base da variação',
        'Indicador',
      ];
      if (typeof cell.value === 'string' && metadataLabels.includes(cell.value)) {
        cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: COLORS.muted } };
      } else {
        cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.slate } };
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } };
    } else if (kind === 'header') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.slate } };
      cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.white } };
      cell.alignment = { vertical: 'middle', horizontal: columnNumber >= columnCount - 1 ? 'right' : 'left' };
    } else if (kind === 'detail') {
      if (rowNumber % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } };
      }
      if (columnNumber === (columnCount === 5 && worksheet.name === 'DRE' ? 3 : 1)) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      }
    } else if (kind === 'subtotal') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtotal } };
      cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.slate } };
      cell.border = { top: { style: 'thin', color: { argb: COLORS.border } }, bottom: { style: 'thin', color: { argb: COLORS.border } } };
    } else if (kind === 'calculated') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.calculated } };
      cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.navy } };
      cell.border = { top: { style: 'thin', color: { argb: COLORS.brand } }, bottom: { style: 'thin', color: { argb: COLORS.brand } } };
    } else if (kind === 'result') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
      cell.font = { name: 'Aptos', size: 11, bold: true, color: { argb: COLORS.white } };
      cell.border = {};
    }
  });

  // Garante que células vazias até a última coluna também recebam o fundo.
  for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
    const cell = row.getCell(columnNumber);
    if (kind === 'title') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
  }
}

function applySheetLayout(
  worksheet: ExcelWorksheet,
  sheet: DreExcelSheet,
  currency: string,
  fractionDigits: number,
): void {
  worksheet.addRows(sheet.rows);
  sheet.widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
  sheet.mergedRanges.forEach((range) => worksheet.mergeCells(range));
  worksheet.views = [{ state: 'frozen', ...sheet.freezePane, activeCell: sheet.freezePane.topLeftCell }];
  worksheet.autoFilter = `${sheet.autoFilter.from}:${sheet.autoFilter.to}`;
  worksheet.properties.defaultRowHeight = 20;
  worksheet.properties.outlineProperties = { summaryBelow: true, summaryRight: true };
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 },
    printTitlesRow: `1:${sheet.headerRow}`,
  };
  worksheet.headerFooter.oddFooter = '&LRelatório gerado pelo Dominex&C&P de &N&RConfidencial';

  sheet.rowKinds.forEach((kind, index) => {
    styleRow(worksheet, index + 1, kind, sheet.widths.length);
    worksheet.getRow(index + 1).outlineLevel = sheet.outlineLevels[index] ?? 0;
  });

  const moneyFormat = currencyNumberFormat(currency, fractionDigits);
  for (let rowNumber = sheet.headerRow + 1; rowNumber <= sheet.rows.length; rowNumber += 1) {
    for (const columnNumber of sheet.currencyColumns) {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      cell.numFmt = moneyFormat;
      if (typeof cell.value === 'number') {
        cell.font = {
          ...cell.font,
          color: { argb: cell.value < 0 ? COLORS.negative : cell.value > 0 ? COLORS.positive : COLORS.muted },
        };
      }
      cell.alignment = { ...cell.alignment, horizontal: 'right' };
    }
    for (const columnNumber of sheet.percentageColumns) {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      cell.numFmt = '0.0%;[Red]-0.0%;-';
      if (typeof cell.value === 'number') {
        cell.font = {
          ...cell.font,
          color: { argb: cell.value < 0 ? COLORS.negative : cell.value > 0 ? COLORS.positive : COLORS.muted },
        };
      }
      cell.alignment = { ...cell.alignment, horizontal: 'right' };
    }
  }

  // Linhas de resultado mantêm contraste branco sobre o fundo escuro.
  sheet.rowKinds.forEach((kind, index) => {
    if (kind !== 'result') return;
    worksheet.getRow(index + 1).eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { ...cell.font, color: { argb: COLORS.white } };
    });
  });
}

/** Monta o workbook completo sem tocar no DOM, para uso e teste em Node. */
export async function createDreExcelWorkbook(data: DreReportData): Promise<ExcelWorkbook> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const currency = normalizedCurrency(data.currency);
  const fractionDigits = currencyFractionDigits(currency);

  workbook.creator = 'Dominex';
  workbook.lastModifiedBy = 'Dominex';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = `DRE - ${data.company.name} - ${data.period}`;
  workbook.title = 'Demonstrativo de Resultado do Exercício';
  workbook.company = data.company.name;
  workbook.calcProperties.fullCalcOnLoad = true;

  for (const sheet of buildDreExcelSheets(data)) {
    const worksheet = workbook.addWorksheet(sheet.name, {
      properties: { tabColor: { argb: sheet.tabColor } },
      views: [{ state: 'frozen', ...sheet.freezePane }],
    });
    applySheetLayout(worksheet, sheet, currency, fractionDigits);
  }

  workbook.views = [{ x: 0, y: 0, width: 12000, height: 22000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  return workbook;
}

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'dre';
}

export async function generateDreExcel(data: DreReportData): Promise<void> {
  const workbook = await createDreExcelWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(`dre-${data.period}-${data.regime ?? 'caixa'}`)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
