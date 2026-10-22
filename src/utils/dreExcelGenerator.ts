import type { DreExportCategory, DreExportGroup, DreReportData } from '@/utils/dreHtmlGenerator';
import dominexLogoUrl from '@/assets/logo-white-horizontal.png';

type DreExcelCell = string | number;

export type DreExcelRowKind =
  | 'title'
  | 'metadata'
  | 'spacer'
  | 'header'
  | 'section'
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

type LoadedImage = { dataUrl: string; width?: number; height?: number };

async function loadImageAsDataUrl(url: string): Promise<LoadedImage | undefined> {
  if (url.startsWith('data:')) return { dataUrl: url };
  if (typeof window === 'undefined') return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const width = bytes.length >= 24
      ? ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0
      : undefined;
    const height = bytes.length >= 24
      ? ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0
      : undefined;
    return { dataUrl: `data:image/png;base64,${window.btoa(binary)}`, width, height };
  } catch {
    return undefined;
  }
}

const COLORS = {
  navy: 'FF172033',
  slate: 'FF334155',
  muted: 'FF64748B',
  border: 'FFE2E8F0',
  zebra: 'FFF8FAFC',
  subtotal: 'FFF1F5F9',
  calculated: 'FFE2E8F0',
  positive: 'FF15803D',
  negative: 'FFB91C1C',
  white: 'FFFFFFFF',
  brand: 'FF00A77E',
  brandLight: 'FFD7F5EC',
  blueLight: 'FFD9E5F7',
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
  hasComparison: boolean;
  add: (row: DreExcelCell[], kind: DreExcelRowKind, outlineLevel?: number) => void;
}

function createRowsBuilder(
  initialRows: DreExcelCell[][],
  initialKinds: DreExcelRowKind[],
  hasComparison = false,
): SheetRowsBuilder {
  const rows = [...initialRows];
  const kinds = [...initialKinds];
  const outlineLevels = initialRows.map(() => 0);

  return {
    rows,
    kinds,
    outlineLevels,
    hasComparison,
    add(row, kind, outlineLevel = 0) {
      rows.push(row);
      kinds.push(kind);
      outlineLevels.push(outlineLevel);
    },
  };
}

function comparisonMetrics(current: number, previous: number, fractionDigits: number) {
  return [
    roundMoney(current - previous, fractionDigits),
    previous === 0 ? '' : (current - previous) / Math.abs(previous),
  ] as const;
}

function dreValueCells(
  current: number,
  previous: number,
  grossRevenue: number,
  comparisonRevenue: number,
  fractionDigits: number,
  absolute: boolean,
  hasComparison: boolean,
): DreExcelCell[] {
  const displayedCurrent = absolute ? Math.abs(current) : current;
  const displayedPrevious = absolute ? Math.abs(previous) : previous;
  const cells: DreExcelCell[] = [
    displayedCurrent,
    percentOfRevenue(displayedCurrent, grossRevenue),
  ];
  if (hasComparison) {
    cells.push(
      displayedPrevious,
      percentOfRevenue(displayedPrevious, comparisonRevenue),
      ...comparisonMetrics(current, previous, fractionDigits),
    );
  }
  return cells;
}

function addCategoryGroup(
  builder: SheetRowsBuilder,
  group: DreExportGroup,
  grossRevenue: number,
  comparisonRevenue: number,
  fractionDigits: number,
  groupIndex: number,
): void {
  const natureCode = NATURE_CODES[group.nature as Exclude<DreExportGroup['nature'], 'excluded'>];
  const groupCode = childCode(natureCode, group.code, String(groupIndex + 1).padStart(2, '0'));
  const current = roundMoney(signedGroupValue(group.total, group.nature), fractionDigits);
  const previous = roundMoney(signedGroupValue(
    group.previous ?? group.categories.reduce((sum, category) => sum + (category.previous ?? 0), 0),
    group.nature,
  ), fractionDigits);
  builder.add([
    `${groupCode} - ${group.name.toLocaleUpperCase('pt-BR')}`,
    ...dreValueCells(current, previous, grossRevenue, comparisonRevenue, fractionDigits, true, builder.hasComparison),
  ], 'subtotal');

  const addCategory = (category: DreExportCategory, categoryIndex: number, outlineLevel = 1) => {
    const value = roundMoney(signedGroupValue(category.value, group.nature), fractionDigits);
    const previousValue = roundMoney(signedGroupValue(category.previous ?? 0, group.nature), fractionDigits);
    const categoryCode = childCode(groupCode, category.code, String(categoryIndex + 1).padStart(3, '0'));
    builder.add([
      `${categoryCode} - ${category.name}`,
      ...dreValueCells(value, previousValue, grossRevenue, comparisonRevenue, fractionDigits, true, builder.hasComparison),
    ], 'detail', outlineLevel);

    category.children?.forEach((child, childIndex) => addCategory(child, childIndex, outlineLevel + 1));
  };

  group.categories.forEach((category, categoryIndex) => addCategory(category, categoryIndex));
}

function addCalculatedRow(
  builder: SheetRowsBuilder,
  code: string,
  label: string,
  current: number,
  previous: number,
  grossRevenue: number,
  comparisonRevenue: number,
  fractionDigits: number,
  kind: 'calculated' | 'result',
): void {
  const rounded = roundMoney(current, fractionDigits);
  const previousRounded = roundMoney(previous, fractionDigits);
  builder.add([
    `${code} - ${label.toLocaleUpperCase('pt-BR')}`,
    ...dreValueCells(rounded, previousRounded, grossRevenue, comparisonRevenue, fractionDigits, false, builder.hasComparison),
  ], kind);
}

function addNature(
  builder: SheetRowsBuilder,
  groups: DreExportGroup[],
  nature: DreExportGroup['nature'],
  label: string,
  grossRevenue: number,
  comparisonRevenue: number,
  fractionDigits: number,
): void {
  const filtered = groups.filter((group) => group.nature === nature);
  const current = roundMoney(filtered.reduce((sum, group) => sum + signedGroupValue(group.total, nature), 0), fractionDigits);
  const previous = roundMoney(filtered.reduce(
    (sum, group) => sum + signedGroupValue(group.previous ?? 0, nature),
    0,
  ), fractionDigits);
  builder.add([
    `${NATURE_CODES[nature as Exclude<DreExportGroup['nature'], 'excluded'>]} - ${label.toLocaleUpperCase('pt-BR')}`,
    ...dreValueCells(current, previous, grossRevenue, comparisonRevenue, fractionDigits, true, builder.hasComparison),
  ], 'section');
  filtered.forEach((group, index) => addCategoryGroup(builder, group, grossRevenue, comparisonRevenue, fractionDigits, index));
}

function buildDreRows(data: DreReportData, fractionDigits: number): SheetRowsBuilder {
  const regime = data.regime === 'competencia' ? 'Competência' : 'Caixa';
  const currency = normalizedCurrency(data.currency);
  const hasComparison = Boolean(data.comparison?.rows.length);
  const builder = createRowsBuilder(
    hasComparison
      ? [
          ['DEMONSTRATIVO DE RESULTADO DO EXERCÍCIO'],
          ['Empresa', data.company.name, '', 'Período', data.period],
          ['CNPJ/CPF', data.company.document ?? 'Não informado', '', 'Regime', regime],
          ['Moeda', currency, '', 'Base percentual', 'Receita bruta'],
          [],
          ['Demonstrativo', data.comparison?.currentPeriod ?? data.period, '', data.comparison?.comparisonPeriod ?? 'Comparação', '', 'Variação', ''],
          ['', 'Valor', '% receita', 'Valor', '% receita', 'Valor', '%'],
        ]
      : [
          ['DEMONSTRATIVO DE RESULTADO DO EXERCÍCIO'],
          ['Empresa', data.company.name, ''],
          ['CNPJ/CPF', data.company.document ?? 'Não informado', ''],
          ['Período', data.period, ''],
          ['Regime', regime, ''],
          ['Moeda', currency, ''],
          ['Base percentual', 'Receita bruta', ''],
          [],
          ['Demonstrativo', data.period, ''],
          ['', 'Valor', '% receita'],
        ],
    hasComparison
      ? ['title', 'metadata', 'metadata', 'metadata', 'spacer', 'header', 'header']
      : ['title', 'metadata', 'metadata', 'metadata', 'metadata', 'metadata', 'metadata', 'spacer', 'header', 'header'],
    hasComparison,
  );
  const grossRevenue = roundMoney(data.receitaBruta, fractionDigits);
  const comparisonByCode = new Map((data.comparison?.rows ?? []).map((row) => [row.code, row.previous]));
  const comparisonRevenue = roundMoney(comparisonByCode.get('01') ?? 0, fractionDigits);
  const configuredGroups = (data.groups ?? []).filter((group) => group.nature !== 'excluded');
  const groups: DreExportGroup[] = configuredGroups.length > 0 ? configuredGroups : [
    { id: 'legacy-revenue', name: 'Receita Bruta', nature: 'revenue', total: data.receitaBruta, categories: data.receitaCategories ?? [] },
    { id: 'legacy-deduction', name: 'Impostos e Deduções', nature: 'deduction', total: data.impostos, categories: data.impostosCategories },
    { id: 'legacy-cost', name: 'Custos Operacionais', nature: 'cost', total: data.cpv, categories: data.cpvCategories },
    { id: 'legacy-opex', name: 'Despesas Operacionais', nature: 'operating_expense', total: data.opex, categories: data.opexCategories },
    { id: 'legacy-non-operating', name: 'Resultado Não Operacional', nature: 'non_operating', total: data.naoOperacional ?? 0, categories: data.naoOperacionalCategories ?? [] },
  ];

  addNature(builder, groups, 'revenue', 'Receita Bruta', grossRevenue, comparisonRevenue, fractionDigits);
  addNature(builder, groups, 'deduction', 'Impostos e Deduções', grossRevenue, comparisonRevenue, fractionDigits);
  addCalculatedRow(builder, '03', 'Receita Líquida', data.receitaLiquida, comparisonByCode.get('03') ?? 0, grossRevenue, comparisonRevenue, fractionDigits, 'calculated');
  addNature(builder, groups, 'cost', 'Custos Operacionais', grossRevenue, comparisonRevenue, fractionDigits);
  addCalculatedRow(builder, '05', 'Lucro Bruto', data.lucroBruto, comparisonByCode.get('05') ?? 0, grossRevenue, comparisonRevenue, fractionDigits, 'calculated');
  addNature(builder, groups, 'operating_expense', 'Despesas Operacionais', grossRevenue, comparisonRevenue, fractionDigits);
  addCalculatedRow(builder, '07', 'Resultado Operacional', data.resultadoLiquido, comparisonByCode.get('07') ?? 0, grossRevenue, comparisonRevenue, fractionDigits, data.naoOperacional ? 'calculated' : 'result');
  addNature(builder, groups, 'non_operating', 'Resultado Não Operacional', grossRevenue, comparisonRevenue, fractionDigits);

  if (data.resultadoFinal !== undefined && data.naoOperacional) {
    addCalculatedRow(builder, '09', 'Resultado Final', data.resultadoFinal, comparisonByCode.get('09') ?? 0, grossRevenue, comparisonRevenue, fractionDigits, 'result');
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
    const expense = roundMoney(Math.abs(center.expense), fractionDigits);
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
    const subtractive = ['02', '04', '06', '08'].includes(row.code);
    builder.add([
      row.code,
      row.label,
      roundMoney(subtractive ? Math.abs(row.current) : row.current, fractionDigits),
      roundMoney(subtractive ? Math.abs(row.previous) : row.previous, fractionDigits),
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
  const hasComparison = Boolean(data.comparison?.rows.length);
  const dre = buildDreRows(data, fractionDigits);
  const dreLastRow = dre.rows.length;

  const sheets: DreExcelSheet[] = [{
    name: 'DRE',
    rows: dre.rows,
    widths: hasComparison ? [54, 19, 12, 19, 12, 19, 14] : [72, 24, 16],
    rowKinds: dre.kinds,
    outlineLevels: dre.outlineLevels,
    mergedRanges: hasComparison
      ? ['A1:G1', 'B2:C2', 'E2:G2', 'B3:C3', 'E3:G3', 'B4:C4', 'E4:G4', 'A6:A7', 'B6:C6', 'D6:E6', 'F6:G6']
      : ['A1:C1', 'B2:C2', 'B3:C3', 'B4:C4', 'B5:C5', 'B6:C6', 'B7:C7', 'A9:A10', 'B9:C9'],
    headerRow: hasComparison ? 7 : 10,
    autoFilter: { from: hasComparison ? 'A7' : 'A10', to: `${hasComparison ? 'G' : 'C'}${dreLastRow}` },
    freezePane: hasComparison
      ? { xSplit: 1, ySplit: 7, topLeftCell: 'B8' }
      : { xSplit: 1, ySplit: 10, topLeftCell: 'B11' },
    currencyColumns: hasComparison ? [2, 4, 6] : [2],
    percentageColumns: hasComparison ? [3, 5, 7] : [3],
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
  const symbol = currency === 'BRL' ? 'R$' : currency === 'USD' ? 'US$' : currency === 'EUR' ? '€' : currency;
  return `"${symbol}" #,##0${decimals};-"${symbol}" #,##0${decimals};-`;
}

function styleRow(worksheet: ExcelWorksheet, rowNumber: number, kind: DreExcelRowKind, columnCount: number): void {
  const row = worksheet.getRow(rowNumber);
  row.height = kind === 'title' ? 34 : kind === 'header' || kind === 'section' ? 25 : kind === 'spacer' ? 9 : 21;

  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    cell.font = { name: 'Arial', size: 10, color: { argb: COLORS.slate } };
    const numericColumn = worksheet.name === 'DRE' ? columnNumber >= 2 : columnNumber >= columnCount - 1;
    cell.alignment = { vertical: 'middle', horizontal: numericColumn ? 'right' : 'left' };

    if (kind !== 'spacer' && kind !== 'title') {
      cell.border = { bottom: { style: 'hair', color: { argb: COLORS.border } } };
    }

    if (kind === 'title') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
      cell.font = { name: 'Arial', size: 16, bold: true, color: { argb: COLORS.white } };
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
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLORS.muted } };
      } else {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.slate } };
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    } else if (kind === 'header') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.slate } };
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.white } };
      cell.alignment = { vertical: 'middle', horizontal: numericColumn ? 'right' : 'left' };
    } else if (kind === 'section') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: COLORS.white } };
      cell.border = { top: { style: 'thin', color: { argb: COLORS.navy } }, bottom: { style: 'thin', color: { argb: COLORS.navy } } };
    } else if (kind === 'detail') {
      if (rowNumber % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } };
      }
    } else if (kind === 'subtotal') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.blueLight } };
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.slate } };
      cell.border = { top: { style: 'thin', color: { argb: COLORS.border } }, bottom: { style: 'thin', color: { argb: COLORS.border } } };
    } else if (kind === 'calculated') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.white } };
      cell.border = { top: { style: 'thin', color: { argb: COLORS.slate } }, bottom: { style: 'thin', color: { argb: COLORS.slate } } };
    } else if (kind === 'result') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navy } };
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: COLORS.white } };
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
    const row = worksheet.getRow(index + 1);
    const outlineLevel = sheet.outlineLevels[index] ?? 0;
    row.outlineLevel = outlineLevel;
    if (worksheet.name === 'DRE' && outlineLevel > 0) {
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: outlineLevel };
    }
  });

  const moneyFormat = currencyNumberFormat(currency, fractionDigits);
  for (let rowNumber = sheet.headerRow + 1; rowNumber <= sheet.rows.length; rowNumber += 1) {
    for (const columnNumber of sheet.currencyColumns) {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      cell.numFmt = moneyFormat;
      if (typeof cell.value === 'number') {
        cell.font = {
          ...cell.font,
          color: { argb: cell.value === 0 ? COLORS.muted : COLORS.slate },
        };
      }
      cell.alignment = { ...cell.alignment, horizontal: 'right' };
    }
    for (const columnNumber of sheet.percentageColumns) {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      cell.numFmt = '0.0%;-0.0%;-';
      if (typeof cell.value === 'number') {
        cell.font = {
          ...cell.font,
          color: { argb: cell.value === 0 ? COLORS.muted : COLORS.slate },
        };
      }
      cell.alignment = { ...cell.alignment, horizontal: 'right' };
    }
  }

  // Faixas externas e resultados mantêm contraste branco sobre o fundo escuro.
  sheet.rowKinds.forEach((kind, index) => {
    if (!['section', 'calculated', 'result'].includes(kind)) return;
    worksheet.getRow(index + 1).eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { ...cell.font, color: { argb: COLORS.white } };
    });
  });

  // Verde/vermelho só no último resultado da DRE. Subtotais, categorias,
  // variações e centros de custo permanecem neutros para facilitar a leitura.
  if (worksheet.name === 'DRE' || worksheet.name === 'Comparativo') {
    const hasFinalResult = sheet.rows.some((row) => String(row[0]).startsWith('09'));
    const finalCode = hasFinalResult ? '09' : '07';
    const finalRowIndex = sheet.rows.findIndex((row) => String(row[0]).startsWith(finalCode));
    if (finalRowIndex >= 0) {
      const resultValue = Number(sheet.rows[finalRowIndex][worksheet.name === 'DRE' ? 1 : 2]);
      const fill = resultValue > 0 ? COLORS.positive : resultValue < 0 ? COLORS.negative : COLORS.navy;
      worksheet.getRow(finalRowIndex + 1).eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        cell.font = { ...cell.font, color: { argb: COLORS.white } };
      });
    }
  }
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
  const brandImage = await loadImageAsDataUrl(dominexLogoUrl);
  const brandImageId = brandImage ? workbook.addImage({ base64: brandImage.dataUrl, extension: 'png' }) : undefined;

  for (const sheet of buildDreExcelSheets(data)) {
    const worksheet = workbook.addWorksheet(sheet.name, {
      properties: { tabColor: { argb: sheet.tabColor } },
      views: [{ state: 'frozen', ...sheet.freezePane }],
    });
    applySheetLayout(worksheet, sheet, currency, fractionDigits);
    if (sheet.name === 'DRE' && brandImageId !== undefined) {
      const maxWidth = 148;
      const maxHeight = 30.06;
      const ratio = brandImage?.width && brandImage.height ? brandImage.width / brandImage.height : maxWidth / maxHeight;
      const width = Math.min(maxWidth, maxHeight * ratio);
      const height = Math.min(maxHeight, maxWidth / ratio);
      worksheet.addImage(brandImageId, {
        tl: { col: Math.max(1.05, sheet.widths.length - 1.95), row: 0.08 },
        ext: { width, height },
        editAs: 'oneCell',
      });
    }
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
